using System.Security.Cryptography;
using System.Text.Json;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

// A short-lived capability reads exactly one device's notification, never an account or workspace.
public sealed class PushPreview(IDataProtectionProvider provider)
{
    private readonly ITimeLimitedDataProtector protector = provider.CreateProtector("AegiTasks.PushPreview.v1").ToTimeLimitedDataProtector();
    public sealed record Grant(Guid DeviceId, Guid UserId, Guid NotificationId, int SessionVersion, bool Chat);
    public string Create(PushDevice device, Guid notificationId, bool chat) => protector.Protect(JsonSerializer.Serialize(new Grant(device.Id, device.UserId, notificationId, device.SessionVersion, chat)), TimeSpan.FromDays(1));
    public Grant? Read(string? token)
    {
        if (token is null || token.Length is 0 or > 2000) return null;
        try { return JsonSerializer.Deserialize<Grant>(protector.Unprotect(token)); }
        catch (Exception e) when (e is CryptographicException or JsonException or FormatException) { return null; }
    }
    public async Task<object?> Get(AppDb db, Guid id, bool chat, string? token, CancellationToken ct)
    {
        var grant = Read(token);
        if (grant == null || grant.NotificationId != id || grant.Chat != chat) return null;
        if (!await db.PushDevices.AnyAsync(d => d.Id == grant.DeviceId && d.UserId == grant.UserId && d.SessionVersion == grant.SessionVersion &&
            db.Users.Any(u => u.Id == grant.UserId && u.Active && u.SessionVersion == grant.SessionVersion), ct)) return null;
        if (chat)
        {
            var now = DateTime.UtcNow;
            var alert = await ChatNotificationEvents.Visible(db, grant.UserId, now).SingleOrDefaultAsync(n => n.Id == id, ct);
            return alert == null ? null : await ChatNotificationEvents.Summary(db, alert.ChatRoomId, grant.UserId, now, ct);
        }
        var notice = await NotificationEvents.Visible(db, grant.UserId).SingleOrDefaultAsync(n => n.Id == id && n.ReadAt == null && n.CreatedAt > DateTime.UtcNow.AddDays(-1), ct);
        if (notice == null) return null;
        var title = notice.TaskTitle.Length > 0 ? notice.TaskTitle : await db.Tasks.IgnoreQueryFilters().Where(t => t.Id == notice.WorkItemId).Select(t => t.Title).SingleAsync(ct);
        return new { title, body = notice.Message, url = $"/?space={notice.SpaceId}&task={notice.WorkItemId}#inbox", tag = notice.Id.ToString(), userId = grant.UserId };
    }
}
