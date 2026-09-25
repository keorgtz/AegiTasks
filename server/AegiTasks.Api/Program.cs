using System.Security.Claims;
using System.Threading.RateLimiting;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Endpoints;
using AegiTasks.Api.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddScoped<SpaceScope>();
builder.Services.AddSingleton<ChangeFeed>();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new UtcDateTimeConverter()));
builder.Services.AddDbContext<AppDb>(o =>
{
    if (builder.Configuration["DatabaseProvider"] == "Sqlite") o.UseSqlite(builder.Configuration.GetConnectionString("Default"));
    else o.UseNpgsql(builder.Configuration.GetConnectionString("Default"));
});
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
var keyPath = builder.Configuration["DataProtectionPath"];
if (!string.IsNullOrEmpty(keyPath)) builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keyPath)).SetApplicationName("AegiTasks");
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "AegiTasks.Session"; o.Cookie.HttpOnly = true; o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = builder.Environment.IsProduction() ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
    o.ExpireTimeSpan = TimeSpan.FromDays(7); o.SlidingExpiration = true;
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
    o.Events.OnValidatePrincipal = async c =>
    {
        var db = c.HttpContext.RequestServices.GetRequiredService<AppDb>();
        var id = c.Principal!.UserId();
        var u = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id);
        if (u is null || !u.Active || c.Principal!.FindFirstValue("sv") != u.SessionVersion.ToString()) c.RejectPrincipal();
    };
});
builder.Services.AddAuthorization(o => {
    o.AddPolicy("Admin", p => p.RequireRole("Admin"));
    foreach (var page in Access.Pages) o.AddPolicy("page:" + page, p => p.RequireAuthenticatedUser().RequireAssertion(async c => {
        var http = (HttpContext)c.Resource!;
        return await Access.Can(http.RequestServices.GetRequiredService<AppDb>(), c.User, page);
    }));
});
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.AddPolicy("login", c => RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(5), QueueLimit = 0 }));
});
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o => o.MultipartBodyLengthLimit = 11 * 1024 * 1024);
var app = builder.Build();
app.Use(async (c, next) =>
{
    c.Response.Headers["X-Content-Type-Options"] = "nosniff";
    c.Response.Headers["Cache-Control"] = "no-store";
    // All mutations require a non-simple header. No CORS is enabled, so other origins cannot supply it.
    if (c.Request.Method is not ("GET" or "HEAD" or "OPTIONS") && c.Request.Headers["X-AegiTasks"] != "1")
    {
        c.Response.StatusCode = 400; await c.Response.WriteAsJsonAsync(new { error = "Solicitud no válida." }); return;
    }
    try { await next(); }
    catch (InputError e) { c.Response.StatusCode = 400; await c.Response.WriteAsJsonAsync(new { error = e.Message }); }
    catch (DbUpdateConcurrencyException) { c.Response.StatusCode = 409; await c.Response.WriteAsJsonAsync(new { error = "Otra persona actualizó este pendiente. Cierra y vuelve a abrirlo antes de guardar." }); }
    catch (DbUpdateException e) { app.Logger.LogWarning(e, "Database rejected a mutation"); c.Response.StatusCode = 409; await c.Response.WriteAsJsonAsync(new { error = "No se pudo guardar: el nombre ya existe o el elemento está en uso." }); }
});
app.UseRateLimiter(); app.UseAuthentication();
app.Use(async (c, next) => {
    if (c.User.Identity?.IsAuthenticated == true) {
        var scope = c.RequestServices.GetRequiredService<SpaceScope>();
        scope.UserId = c.User.UserId();
        var paths = new[] { "/api/workspace", "/api/projects", "/api/folders", "/api/statuses", "/api/tags", "/api/tasks", "/api/attachments", "/api/notes", "/api/note-folders", "/api/focus" };
        if (paths.Any(p => c.Request.Path.StartsWithSegments(p))) {
            var db = c.RequestServices.GetRequiredService<AppDb>();
            var raw = c.Request.Headers["X-Space-Id"].ToString();
            if (string.IsNullOrEmpty(raw) && c.Request.Path.StartsWithSegments("/api/attachments")) raw = c.Request.Query["space"].ToString();
            Space? space;
            if (string.IsNullOrEmpty(raw)) space = await db.Spaces.SingleOrDefaultAsync(s => s.IsPersonal && s.OwnerId == scope.UserId);
            else if (Guid.TryParse(raw, out var id)) space = await Access.SpacesFor(db, scope.UserId).SingleOrDefaultAsync(s => s.Id == id);
            else space = null;
            if (space == null) { c.Response.StatusCode = 403; await c.Response.WriteAsJsonAsync(new { error = "No tienes acceso a este espacio. Selecciona otro espacio." }); return; }
            scope.SpaceId = space.Id;
        }
    }
    await next();
});
app.UseAuthorization();
app.Use(async (c, next) => {
    await next();
    if (c.Request.Method is "GET" or "HEAD" or "OPTIONS" || c.Response.StatusCode >= 300 || c.User.Identity?.IsAuthenticated != true) return;
    var feed = c.RequestServices.GetRequiredService<ChangeFeed>();
    var space = c.RequestServices.GetRequiredService<SpaceScope>().SpaceId;
    var area = c.Request.Path.Value?.Split('/').ElementAtOrDefault(2);
    switch (area) {
        case "projects":
            feed.Publish(space, null, "catalog", "tasks");
            if (c.Request.Method == "DELETE") feed.Publish(space, null, "notes");
            break;
        case "folders": case "statuses": case "tags": feed.Publish(space, null, "catalog", "tasks"); break;
        case "tasks":
            feed.Publish(space, null, "tasks");
            if (c.Request.Method == "DELETE") feed.Publish(space, null, "notes");
            break;
        case "notes": case "note-folders":
            feed.Publish(space, null, "notes");
            if (c.Request.Path.Value!.EndsWith("/task", StringComparison.OrdinalIgnoreCase)) feed.Publish(space, null, "tasks");
            break;
        case "focus": feed.Publish(null, c.User.UserId(), "focus"); break;
        case "spaces": case "users": case "roles": feed.Publish(null, null, "access", "catalog"); break;
        case "auth": feed.Publish(null, c.User.UserId(), "access"); break;
    }
});
app.MapGet("/api/events", (HttpContext c, Guid space, ChangeFeed feed, IServiceScopeFactory scopes) => feed.Stream(c, space, scopes)).RequireAuthorization();
app.MapGet("/api/health", async (AppDb db) => await db.Database.CanConnectAsync() ? Results.Ok(new { status = "ok" }) : Results.StatusCode(503));
app.MapAuth(); app.MapCatalog(); app.MapTasks(); app.MapSpaces(); app.MapNotes(); app.MapFocus(); app.MapRoles();
if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    if (app.Configuration["DatabaseProvider"] == "Sqlite")
    {
        if (app.Environment.IsProduction()) throw new InvalidOperationException("Production requires PostgreSQL.");
        await db.Database.EnsureCreatedAsync();
        // EnsureCreated does not apply migrations to an existing local database.
        await db.Database.OpenConnectionAsync();
        try {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = "PRAGMA table_info('Projects')";
            var hasLabels = false;
            await using (var columns = await command.ExecuteReaderAsync())
                while (await columns.ReadAsync()) hasLabels |= columns.GetString(1) == "Labels";
            if (!hasLabels) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Projects ADD COLUMN Labels TEXT NOT NULL DEFAULT ''");
            command.CommandText = "PRAGMA table_info('FocusProfiles')";
            var focusColumns = new HashSet<string>();
            await using (var columns = await command.ExecuteReaderAsync())
                while (await columns.ReadAsync()) focusColumns.Add(columns.GetString(1));
            if (!focusColumns.Contains("AccentColor")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE FocusProfiles ADD COLUMN AccentColor TEXT NOT NULL DEFAULT '#A78BFA'");
            if (!focusColumns.Contains("ParticleShape")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE FocusProfiles ADD COLUMN ParticleShape TEXT NOT NULL DEFAULT 'mixed'");
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }
    else await db.Database.MigrateAsync();
    await Bootstrap.Seed(db, scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>(), app.Configuration);
}
app.Run();
public partial class Program;
