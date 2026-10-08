using System.Text.Json;
using AegiTasks.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public sealed class PushSender(IServiceScopeFactory scopes, PushKeys keys, IPushTransport transport, ILogger<PushSender> logger, PushWakeup wakeup, PushPreview preview) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await Dispatch(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception e) { logger.LogWarning("Push queue unavailable ({ErrorType}); retrying", e.GetType().Name); }
            try { await wakeup.Wait(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
    public async Task Dispatch(CancellationToken stoppingToken)
    {
        // Separate DbContexts keep a slow task provider request from blocking all chat deliveries.
        await Task.WhenAll(DispatchTasks(stoppingToken), DispatchChatQueue(stoppingToken));
    }
    private async Task DispatchChatQueue(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        await DispatchChats(scope.ServiceProvider.GetRequiredService<AppDb>(), ct);
    }
    private async Task DispatchTasks(CancellationToken stoppingToken)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDb>();
        var now = DateTime.UtcNow;
        var pending = await db.PushDeliveries.Where(d => d.FinishedAt == null && d.NextAttemptAt <= now).OrderBy(d => d.NextAttemptAt).Take(50).ToListAsync(stoppingToken);
        foreach (var delivery in pending)
        {
            var device = await db.PushDevices.SingleOrDefaultAsync(d => d.Id == delivery.DeviceId, stoppingToken);
            var notification = device == null ? null : await NotificationEvents.Visible(db, device.UserId).SingleOrDefaultAsync(n => n.Id == delivery.NotificationId, stoppingToken);
            var valid = device != null && notification != null && notification.ReadAt == null &&
                notification.CreatedAt > now.AddDays(-1) && await db.Users.AnyAsync(u => u.Id == device.UserId && u.SessionVersion == device.SessionVersion, stoppingToken);
            if (!valid) { delivery.FinishedAt = now; await db.SaveChangesAsync(stoppingToken); continue; }
            delivery.Attempts++;
            try
            {
                // No task titles, comments or evidence contents leave the application server.
                var payload = JsonSerializer.Serialize(new { notificationId = notification!.Id, deviceId = device!.Id,
                    backgroundToken = preview.Create(device!, notification!.Id, false), expiresAt = DateTime.UtcNow.AddDays(1) });
                if (await transport.Send(device!, payload, keys.Details, stoppingToken)) delivery.FinishedAt = DateTime.UtcNow;
                else db.PushDevices.Remove(device!);
            }
            catch (Exception e) when (!stoppingToken.IsCancellationRequested)
            {
                // Never log endpoint URLs, keys, payloads or exception messages containing them.
                logger.LogWarning("Push delivery {DeliveryId} failed ({ErrorType}), attempt {Attempt}", delivery.Id, e.GetType().Name, delivery.Attempts);
                if (delivery.Attempts >= 8) delivery.FinishedAt = DateTime.UtcNow;
                else delivery.NextAttemptAt = DateTime.UtcNow.AddSeconds(Math.Min(3600, 15 * Math.Pow(2, delivery.Attempts)));
            }
            await db.SaveChangesAsync(stoppingToken);
        }
        // Bound the outbox without removing the user's notification history.
        await db.PushDeliveries.Where(d => d.FinishedAt < now.AddDays(-7)).ExecuteDeleteAsync(stoppingToken);
    }
    private async Task DispatchChats(AppDb db, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var pending = await db.ChatPushDeliveries.Where(d => d.FinishedAt == null && d.NextAttemptAt <= now)
            .OrderBy(d => d.NextAttemptAt).Take(50).Select(d => new { delivery = d, room = db.ChatAlerts.Where(n => n.Id == d.NotificationId).Select(n => n.ChatRoomId).First() }).ToListAsync(ct);
        foreach (var group in pending.GroupBy(d => (d.delivery.DeviceId, d.room))) {
            var device = await db.PushDevices.SingleOrDefaultAsync(d => d.Id == group.Key.DeviceId, ct);
            var notice = device == null ? null : await ChatNotificationEvents.Summary(db, group.Key.room, device.UserId, now, ct);
            var valid = device != null && notice != null && await db.Users.AnyAsync(u => u.Id == device.UserId && u.Active && u.SessionVersion == device.SessionVersion, ct);
            if (!valid) { foreach (var row in group) row.delivery.FinishedAt = now; await db.SaveChangesAsync(ct); continue; }
            foreach (var row in group) row.delivery.Attempts++;
            try {
                // Content stays behind authentication; one grouped push per conversation/device/batch.
                var payload = JsonSerializer.Serialize(new { chatNotificationId = notice!.Id, deviceId = device!.Id,
                    backgroundToken = preview.Create(device!, notice!.Id, true), expiresAt = DateTime.UtcNow.AddDays(1),
                    userId = notice.UserId, roomId = notice.RoomId, sequence = notice.Sequence, count = notice.Count });
                if (await transport.Send(device!, payload, keys.Details, ct)) foreach (var row in group) row.delivery.FinishedAt = DateTime.UtcNow;
                else db.PushDevices.Remove(device!);
            } catch (Exception e) when (!ct.IsCancellationRequested) {
                logger.LogWarning("Chat push failed ({ErrorType})", e.GetType().Name);
                foreach (var row in group) {
                    if (row.delivery.Attempts >= 8) row.delivery.FinishedAt = DateTime.UtcNow;
                    else row.delivery.NextAttemptAt = DateTime.UtcNow.AddSeconds(Math.Min(3600, 15 * Math.Pow(2, row.delivery.Attempts)));
                }
            }
            await db.SaveChangesAsync(ct);
        }
        await db.ChatAlerts.Where(n => n.CreatedAt < now.AddDays(-7)).ExecuteDeleteAsync(ct);
        await db.ChatPushDeliveries.Where(d => d.FinishedAt < now.AddDays(-7)).ExecuteDeleteAsync(ct);
    }
}
