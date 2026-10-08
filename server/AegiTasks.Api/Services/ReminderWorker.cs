using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public sealed class ReminderWorker(IServiceScopeFactory scopes, TimeProvider clock, ChangeFeed feed, PushWakeup wakeup, ILogger<ReminderWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10), clock);
        do {
            try { await Dispatch(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception e) { logger.LogWarning("Reminder queue unavailable ({ErrorType}); retrying", e.GetType().Name); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
    public async Task Dispatch(CancellationToken ct)
    {
        using var batch = scopes.CreateScope();
        var store = batch.ServiceProvider.GetRequiredService<AppDb>();
        var now = clock.GetUtcNow().UtcDateTime;
        var due = await store.Reminders.IgnoreQueryFilters().AsNoTracking().Where(r => r.Enabled && r.NextRunAt <= now)
            .OrderBy(r => r.NextRunAt).Take(100).ToListAsync(ct);
        foreach (var item in due) {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDb>();
            now = clock.GetUtcNow().UtcDateTime;
            var next = ReminderSchedule.Parse(item.ScheduleJson).Next(now);
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            // Conditional claim and outbox are one transaction, so retries/restarts cannot duplicate an occurrence.
            var claimed = await db.Reminders.IgnoreQueryFilters().Where(r => r.Id == item.Id && r.Enabled && r.Version == item.Version && r.NextRunAt == item.NextRunAt)
                .ExecuteUpdateAsync(p => p.SetProperty(r => r.NextRunAt, next), ct);
            if (claimed == 0) { await transaction.RollbackAsync(ct); continue; }
            var recipients = new List<Guid>();
            if (await ReminderAccess.Runnable(db).AnyAsync(r => r.Id == item.Id, ct)) {
                var candidates = await Access.Members(db, item.SpaceId).Where(u => u.Active).Select(u => u.Id).ToListAsync(ct);
                foreach (var candidate in candidates)
                    if (await ReminderAccess.ForRecipient(db, candidate).AnyAsync(r => r.Id == item.Id, ct)) recipients.Add(candidate);
            }
            var title = item.Title;
            if (item.WorkItemId != null) title = await db.Tasks.IgnoreQueryFilters().Where(t => t.Id == item.WorkItemId).Select(t => t.Title).SingleAsync(ct);
            foreach (var recipient in recipients) {
                var notice = new TaskNotification { UserId = recipient, SpaceId = item.SpaceId, WorkItemId = item.WorkItemId, ReminderId = item.Id,
                    Kind = "reminder", TaskTitle = title, Message = item.Message.Length > 0 ? item.Message : "Tienes este pendiente por resolver.", CreatedAt = now };
                db.Notifications.Add(notice);
                var devices = await db.PushDevices.Where(d => d.UserId == recipient && db.Users.Any(u => u.Id == recipient && u.SessionVersion == d.SessionVersion)).Select(d => d.Id).ToListAsync(ct);
                foreach (var device in devices) db.PushDeliveries.Add(new PushDelivery { NotificationId = notice.Id, DeviceId = device });
            }
            if (recipients.Count > 0) await db.Reminders.IgnoreQueryFilters().Where(r => r.Id == item.Id).ExecuteUpdateAsync(p => p.SetProperty(r => r.LastSentAt, now), ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            foreach (var recipient in recipients) feed.Publish(null, recipient, "notifications");
            feed.Publish(item.SpaceId, null, "reminders");
            if (recipients.Count > 0) wakeup.Notify();
        }
    }
}
