using System.Security.Claims;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class ChatNotificationEndpoints
{
    public static void MapChatNotifications(this WebApplication app)
    {
        var routes = app.MapGroup("/api/chat").RequireAuthorization("page:chat");
        routes.MapGet("/{id:guid}/notifications", async (Guid id, AppDb db, ClaimsPrincipal user) => {
            var uid = user.UserId();
            if (!await db.ChatMembers.AnyAsync(m => m.ChatRoomId == id && m.UserId == uid)) return Results.NotFound();
            var pref = await db.ChatNotificationPreferences.AsNoTracking().SingleOrDefaultAsync(p => p.ChatRoomId == id && p.UserId == uid);
            var settings = ChatSilence.Parse(pref?.Settings);
            return Results.Ok(new { settings, version = pref?.Version, muted = settings.Muted(DateTime.UtcNow) });
        });
        routes.MapPut("/{id:guid}/notifications", async (Guid id, PreferenceInput input, AppDb db, ClaimsPrincipal user, ChangeFeed feed) => {
            var uid = user.UserId(); var now = DateTime.UtcNow;
            if (input.Settings == null) throw new InputError("Configuración no válida.");
            var zone = input.Settings.TimeZone;
            if (zone != null && TimeZoneInfo.TryConvertWindowsIdToIanaId(zone, out var iana)) zone = iana;
            var settings = input.Settings with { TimeZone = zone!, Until = input.Settings.Until?.ToUniversalTime() };
            settings.Validate(now);
            await using var tx = await db.Database.BeginTransactionAsync();
            if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"ChatRooms\" WHERE \"Id\" = {id} FOR UPDATE");
            if (!await db.ChatMembers.AnyAsync(m => m.ChatRoomId == id && m.UserId == uid)) return Results.NotFound();
            var pref = await db.ChatNotificationPreferences.SingleOrDefaultAsync(p => p.ChatRoomId == id && p.UserId == uid);
            if (pref?.Version != input.Version) return Results.Conflict(new { error = "Tus preferencias cambiaron en otra sesión. Cierra y vuelve a abrir este diálogo." });
            if (pref == null) { pref = new() { ChatRoomId = id, UserId = uid }; db.ChatNotificationPreferences.Add(pref); }
            pref.Settings = settings.Serialize(); pref.Version = Guid.NewGuid();
            await db.SaveChangesAsync();
            if (settings.Muted(now)) await db.ChatAlerts.Where(n => n.ChatRoomId == id && n.UserId == uid).ExecuteDeleteAsync();
            await tx.CommitAsync();
            feed.Publish(null, uid, "chat", "chat-notifications");
            return Results.Ok(new { version = pref.Version });
        });
        routes.MapGet("/notifications", async (AppDb db, ClaimsPrincipal user) => {
            var now = DateTime.UtcNow; var uid = user.UserId();
            var roomIds = await ChatNotificationEvents.Visible(db, uid, now).GroupBy(n => n.ChatRoomId).OrderByDescending(g => g.Max(n => n.CreatedAt)).Select(g => g.Key).Take(30).ToListAsync();
            var items = new List<ChatNotificationEvents.ChatNotice>();
            foreach (var room in roomIds) { var notice = await ChatNotificationEvents.Summary(db, room, uid, now); if (notice != null) items.Add(notice); }
            return Results.Ok(items);
        });
        routes.MapGet("/notifications/{id:guid}/push", async (Guid id, Guid device, AppDb db, ClaimsPrincipal user, HttpContext http) => {
            var uid = user.UserId(); var version = int.Parse(user.FindFirstValue("sv")!);
            if (http.Request.Cookies[NotificationEndpoints.DeviceCookie] != device.ToString() || !await db.PushDevices.AnyAsync(d => d.Id == device && d.UserId == uid && d.SessionVersion == version)) return Results.NotFound();
            var now = DateTime.UtcNow;
            var alert = await ChatNotificationEvents.Visible(db, uid, now).SingleOrDefaultAsync(n => n.Id == id);
            if (alert == null) return Results.NotFound();
            var notice = await ChatNotificationEvents.Summary(db, alert.ChatRoomId, uid, now);
            return notice == null ? Results.NotFound() : Results.Ok(notice);
        });
    }
    public record PreferenceInput(ChatSilence Settings, Guid? Version);
}
