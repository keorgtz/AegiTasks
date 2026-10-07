using System.Text.Json;
using AegiTasks.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public sealed class PushSender(IServiceScopeFactory scopes, PushKeys keys, IPushTransport transport, ILogger<PushSender> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await Dispatch(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception e) { logger.LogWarning("Push queue unavailable ({ErrorType}); retrying", e.GetType().Name); }
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
    public async Task Dispatch(CancellationToken stoppingToken)
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
                var payload = JsonSerializer.Serialize(new { notificationId = notification!.Id, deviceId = device!.Id });
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
}
