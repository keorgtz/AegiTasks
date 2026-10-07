using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class NotificationEndpoints
{
    public const string DeviceCookie = "AegiTasks.PushDevice";
    public static void MapNotifications(this WebApplication app)
    {
        var group = app.MapGroup("/api/notifications").RequireAuthorization();
        group.MapGet("/", async (AppDb db, ClaimsPrincipal user, int? page, bool? unread) => {
            var query = NotificationEvents.Visible(db, user.UserId());
            var unreadCount = await query.CountAsync(n => n.ReadAt == null);
            if (unread == true) query = query.Where(n => n.ReadAt == null);
            var currentPage = Math.Clamp(page ?? 1, 1, 100000);
            var items = await query.OrderByDescending(n => n.CreatedAt).ThenBy(n => n.Id).Skip((currentPage - 1) * 30).Take(30)
                .Select(n => new { n.Id, n.SpaceId, n.WorkItemId, n.Kind, n.Message, n.CreatedAt, n.ReadAt,
                    title = n.TaskTitle != "" ? n.TaskTitle : db.Tasks.IgnoreQueryFilters().Where(t => t.Id == n.WorkItemId).Select(t => t.Title).First(),
                    spaceName = db.Spaces.Where(s => s.Id == n.SpaceId).Select(s => s.Name).First() }).ToListAsync();
            return Results.Ok(new { items, unreadCount, total = await query.CountAsync(), page = currentPage, pageSize = 30 });
        });
        group.MapPut("/{id:guid}/read", async (Guid id, AppDb db, ClaimsPrincipal user, ChangeFeed feed) => {
            var notification = await NotificationEvents.Visible(db, user.UserId()).SingleOrDefaultAsync(n => n.Id == id);
            if (notification == null) return Results.NotFound();
            notification.ReadAt ??= DateTime.UtcNow; await db.SaveChangesAsync();
            feed.Publish(null, user.UserId(), "notifications"); return Results.NoContent();
        });
        group.MapPut("/read-all", async (AppDb db, ClaimsPrincipal user, ChangeFeed feed) => {
            await NotificationEvents.Visible(db, user.UserId()).Where(n => n.ReadAt == null).ExecuteUpdateAsync(p => p.SetProperty(n => n.ReadAt, DateTime.UtcNow));
            feed.Publish(null, user.UserId(), "notifications"); return Results.NoContent();
        });
        group.MapDelete("/{id:guid}", async (Guid id, AppDb db, ClaimsPrincipal user, ChangeFeed feed) => {
            var removed = await db.Notifications.Where(n => n.Id == id && n.UserId == user.UserId()).ExecuteDeleteAsync();
            if (removed == 0) return Results.NotFound();
            feed.Publish(null, user.UserId(), "notifications"); return Results.NoContent();
        });
        group.MapDelete("/", async (AppDb db, ClaimsPrincipal user, ChangeFeed feed) => {
            // Clear the owner's history across all Spaces, including notices no longer visible.
            // Cascading foreign keys also remove queued push deliveries, but keep devices enabled.
            await db.Notifications.Where(n => n.UserId == user.UserId()).ExecuteDeleteAsync();
            feed.Publish(null, user.UserId(), "notifications"); return Results.NoContent();
        });
        group.MapGet("/push-config", (PushKeys keys) => Results.Ok(new { publicKey = keys.Details.PublicKey }));
        group.MapPost("/devices", async (DeviceInput input, AppDb db, ClaimsPrincipal user, HttpContext http) => {
            Validate(input);
            await using var transaction = await db.Database.BeginTransactionAsync();
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input.Endpoint)));
            var device = await db.PushDevices.SingleOrDefaultAsync(d => d.EndpointHash == hash);
            var userId = user.UserId();
            if (device == null && await db.PushDevices.CountAsync(d => d.UserId == userId) >= 20) throw new InputError("Máximo 20 dispositivos. Desactiva las notificaciones en alguno antes de registrar otro.");
            if (device == null) { device = new PushDevice { EndpointHash = hash }; db.PushDevices.Add(device); }
            // Rebinding a shared browser invalidates queued deliveries for its previous account.
            if (device.UserId != userId || device.SessionVersion != int.Parse(user.FindFirstValue("sv")!) || device.P256dh != input.Keys.P256dh || device.Auth != input.Keys.Auth)
                await db.PushDeliveries.Where(d => d.DeviceId == device.Id).ExecuteDeleteAsync();
            device.UserId = userId; device.SessionVersion = int.Parse(user.FindFirstValue("sv")!);
            device.Endpoint = input.Endpoint; device.P256dh = input.Keys.P256dh; device.Auth = input.Keys.Auth; device.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            http.Response.Cookies.Append(DeviceCookie, device.Id.ToString(), new CookieOptions { HttpOnly = true, Secure = app.Environment.IsProduction() || http.Request.IsHttps, SameSite = SameSiteMode.Strict, MaxAge = TimeSpan.FromDays(7), Path = "/" });
            return Results.Ok(new { device.Id });
        });
        group.MapGet("/device", async (HttpContext http, AppDb db, ClaimsPrincipal user) => {
            var id = Guid.TryParse(http.Request.Cookies[DeviceCookie], out var value) ? value : Guid.Empty;
            var version = int.Parse(user.FindFirstValue("sv")!);
            return Results.Ok(new { enabled = await db.PushDevices.AnyAsync(d => d.Id == id && d.UserId == user.UserId() && d.SessionVersion == version) });
        });
        group.MapDelete("/device", async (HttpContext http, AppDb db, ClaimsPrincipal user) => {
            await RemoveDevice(http, db, user.UserId()); return Results.NoContent();
        });
        group.MapGet("/{id:guid}/push", async (Guid id, Guid device, HttpContext http, AppDb db, ClaimsPrincipal user) => {
            var uid = user.UserId(); var version = int.Parse(user.FindFirstValue("sv")!);
            if (http.Request.Cookies[DeviceCookie] != device.ToString() || !await db.PushDevices.AnyAsync(d => d.Id == device && d.UserId == uid && d.SessionVersion == version)) return Results.NotFound();
            var n = await NotificationEvents.Visible(db, uid).SingleOrDefaultAsync(n => n.Id == id && n.ReadAt == null);
            if (n == null) return Results.NotFound();
            var title = n.TaskTitle.Length > 0 ? n.TaskTitle : await db.Tasks.IgnoreQueryFilters().Where(t => t.Id == n.WorkItemId).Select(t => t.Title).SingleAsync();
            return Results.Ok(new { title, body = n.Message, url = $"/?space={n.SpaceId}&task={n.WorkItemId}#inbox", tag = n.Id.ToString() });
        });
    }
    public static async Task RemoveDevice(HttpContext http, AppDb db, Guid userId)
    {
        if (Guid.TryParse(http.Request.Cookies[DeviceCookie], out var id))
            await db.PushDevices.Where(d => d.Id == id && d.UserId == userId).ExecuteDeleteAsync();
        http.Response.Cookies.Delete(DeviceCookie, new CookieOptions { Path = "/" });
    }
    private static void Validate(DeviceInput input)
    {
        if (input.Endpoint == null || input.Endpoint.Length > 2048 || !Uri.TryCreate(input.Endpoint, UriKind.Absolute, out var uri) ||
            uri.Scheme != "https" || !uri.IsDefaultPort || !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Fragment)) throw new InputError("Suscripción push no válida.");
        var host = uri.IdnHost.ToLowerInvariant();
        // Restrict outbound push requests to provider endpoints; never accept arbitrary URLs.
        if (!(host == "fcm.googleapis.com" || host == "updates.push.services.mozilla.com" || host == "web.push.apple.com" ||
            host.EndsWith(".push.apple.com", StringComparison.Ordinal) || host.EndsWith(".notify.windows.com", StringComparison.Ordinal))) throw new InputError("El proveedor de notificaciones no es compatible.");
        if (input.Keys == null || !ValidKey(input.Keys.P256dh, 65, true) || !ValidKey(input.Keys.Auth, 16, false)) throw new InputError("Claves push no válidas.");
    }
    private static bool ValidKey(string? key, int length, bool publicKey)
    {
        if (key == null || key.Length > 100 || key.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_')) return false;
        try { var bytes = Convert.FromBase64String(key.Replace('-', '+').Replace('_', '/') + new string('=', (4 - key.Length % 4) % 4)); return bytes.Length == length && (!publicKey || bytes[0] == 4); }
        catch (FormatException) { return false; }
    }
    public record DeviceInput(string Endpoint, DeviceKeys Keys);
    public record DeviceKeys(string P256dh, string Auth);
}
