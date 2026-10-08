using System.Security.Claims;
using System.Net.Mail;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuth(this WebApplication app)
    {
        app.MapPost("/api/auth/login", async (LoginInput input, AppDb db, IPasswordHasher<User> hash, HttpContext context) =>
        {
            // Keep Email as a fallback for clients running the previous PWA release.
            var identifier = (input.Identifier ?? input.Email)?.Trim().ToLowerInvariant() ?? "";
            if (identifier.Length is 0 or > 200) return Results.Json(new { error = "Correo, usuario o contraseña incorrectos." }, statusCode: 401);
            var user = await db.Users.SingleOrDefaultAsync(x => (identifier.Contains('@') ? x.Email == identifier : x.Username == identifier) && x.Active);
            if (user == null || input.Password is null || hash.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
                return Results.Json(new { error = "Correo, usuario o contraseña incorrectos." }, statusCode: 401);
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Role, user.Role), new Claim("sv", user.SessionVersion.ToString()) }, CookieAuthenticationDefaults.AuthenticationScheme);
            await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
            return Results.Ok(Rules.PublicUser(user));
        }).RequireRateLimiting("login");
        app.MapPost("/api/auth/logout", async (HttpContext c, AppDb db) => {
            if (c.User.Identity?.IsAuthenticated == true) await NotificationEndpoints.RemoveDevice(c, db, c.User.UserId());
            await c.SignOutAsync(); return Results.NoContent();
        });
        app.MapGet("/api/auth/me", async (AppDb db, ClaimsPrincipal principal) => Rules.PublicUser(await db.Users.SingleAsync(x => x.Id == principal.UserId()))).RequireAuthorization();
        app.MapPut("/api/auth/profile", async (ProfileInput input, AppDb db, IPasswordHasher<User> hash, ClaimsPrincipal principal, ChangeFeed feed) =>
        {
            var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == principal.UserId());
            if (input.Original != null && (input.Original.Name != user.Name || input.Original.Username != user.Username || input.Original.Email != user.Email))
                return Results.Conflict(new { error = "Tu cuenta cambió en otra sesión. Recarga los datos antes de guardar." });
            var name = Rules.Text(input.Name, 80, "Nombre");
            var username = Rules.Username(input.Username);
            var email = Email(input.Email);
            if (username != user.Username || email != user.Email) {
                if (input.CurrentPassword is null || hash.VerifyHashedPassword(user, user.PasswordHash, input.CurrentPassword) == PasswordVerificationResult.Failed)
                    throw new InputError("Confirma tu contraseña actual para cambiar el usuario o correo.");
            }
            await UniqueIdentity(db, user.Id, username, email);
            // Compare and update atomically; concurrent profile or security changes cannot be overwritten.
            var changed = await db.Users.Where(u => u.Id == user.Id && u.Active && u.Name == user.Name && u.Username == user.Username && u.Email == user.Email && u.SessionVersion == user.SessionVersion && u.PasswordHash == user.PasswordHash)
                .ExecuteUpdateAsync(p => p.SetProperty(u => u.Name, name).SetProperty(u => u.Username, username).SetProperty(u => u.Email, email));
            if (changed == 0) return Results.Conflict(new { error = "Tu cuenta cambió en otra sesión. Recarga los datos antes de guardar." });
            // Profile changes never grant roles, reactivate accounts or invalidate device subscriptions.
            user.Name = name; user.Username = username; user.Email = email;
            feed.Publish(null, null, "access", "catalog");
            return Results.Ok(Rules.PublicUser(user));
        }).RequireAuthorization().RequireRateLimiting("profile");
        app.MapPost("/api/auth/password", async (PasswordInput input, AppDb db, IPasswordHasher<User> hash, ClaimsPrincipal principal, HttpContext context) =>
        {
            var user = await db.Users.SingleAsync(x => x.Id == principal.UserId());
            if (input.CurrentPassword is null || hash.VerifyHashedPassword(user, user.PasswordHash, input.CurrentPassword) == PasswordVerificationResult.Failed) throw new InputError("La contraseña actual no coincide.");
            Rules.Password(input.NewPassword); user.PasswordHash = hash.HashPassword(user, input.NewPassword); user.SessionVersion++;
            await db.SaveChangesAsync(); await context.SignOutAsync(); return Results.NoContent();
        }).RequireAuthorization();
        var admin = app.MapGroup("/api/users").RequireAuthorization("Admin");
        admin.MapPost("/", async (UserInput input, AppDb db, IPasswordHasher<User> hash) =>
        {
            var email = Email(input.Email);
            Rules.Password(input.Password ?? "");
            if (!await db.Roles.AnyAsync(r => r.Name == input.Role)) throw new InputError("Rol no válido.");
            var user = new User { Email = email, Name = Rules.Text(input.Name, 80, "Nombre"), Role = input.Role };
            user.Username = input.Username == null
                ? Rules.DefaultUsername(email, (await db.Users.Select(u => u.Username).ToListAsync()).ToHashSet(StringComparer.OrdinalIgnoreCase))
                : Rules.Username(input.Username);
            await UniqueIdentity(db, user.Id, user.Username, user.Email);
            user.PasswordHash = hash.HashPassword(user, input.Password ?? ""); db.Users.Add(user); Access.AddPersonal(db, user); await db.SaveChangesAsync(); return Results.Ok(Rules.PublicUser(user));
        });
        admin.MapPut("/{id:guid}", async (Guid id, UserUpdate input, AppDb db, IPasswordHasher<User> hash, ClaimsPrincipal principal) =>
        {
            var user = await db.Users.FindAsync(id); if (user == null) return Results.NotFound();
            if (id == principal.UserId() && (!input.Active || input.Role != "Admin")) throw new InputError("No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.");
            if (!await db.Roles.AnyAsync(r => r.Name == input.Role)) throw new InputError("Rol no válido.");
            if (input.Username != null) {
                var username = Rules.Username(input.Username);
                user.Username = username;
            }
            if (input.Email != null) user.Email = Email(input.Email);
            await UniqueIdentity(db, id, user.Username, user.Email);
            user.Name = Rules.Text(input.Name, 80, "Nombre"); user.Active = input.Active; user.Role = input.Role; user.SessionVersion++;
            // Omitted/null keeps the password; an explicit empty string removes it.
            if (input.Password is not null) { Rules.Password(input.Password); user.PasswordHash = hash.HashPassword(user, input.Password); }
            await db.SaveChangesAsync(); return Results.Ok(Rules.PublicUser(user));
        });
    }
    private static string Email(string value)
    {
        var email = Rules.Text(value, 200, "Correo").ToLowerInvariant();
        if (!MailAddress.TryCreate(email, out var parsed) || parsed.Address != email) throw new InputError("Correo no válido.");
        return email;
    }
    private static async Task UniqueIdentity(AppDb db, Guid id, string username, string email)
    {
        if (await db.Users.AnyAsync(u => u.Id != id && u.Username == username)) throw new InputError("Ese nombre de usuario ya está en uso.");
        if (await db.Users.AnyAsync(u => u.Id != id && u.Email == email)) throw new InputError("Ese correo ya está en uso.");
    }
    public record LoginInput(string? Email, string Password, string? Identifier = null);
    public record ProfileInput(string Name, string Username, string Email, string? CurrentPassword = null, ProfileSnapshot? Original = null);
    public record ProfileSnapshot(string Name, string Username, string Email);
    public record PasswordInput(string CurrentPassword, string NewPassword);
    public record UserInput(string Email, string Name, string Role, string? Password, string? Username = null);
    public record UserUpdate(string Name, string Role, bool Active, string? Password, string? Username = null, string? Email = null);
}
