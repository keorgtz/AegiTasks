using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TaskStatus = AegiTasks.Api.Domain.TaskStatus;
using Microsoft.AspNetCore.DataProtection;

var checks = 0;
void Assert(bool condition, string name) { if (!condition) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
DateTime Utc(string value) => DateTime.Parse(value).ToUniversalTime();
var start = Utc("2026-10-09T09:00:00Z");
var minute = new ReminderSchedule(Every: 5, Unit: "minutes", StartsAt: start);
minute.Validate();
Assert(minute.Next(start.AddSeconds(-1)) == start, "First interval starts at the anchor");
Assert(minute.Next(start) == start.AddMinutes(5), "Dispatched interval boundary is exclusive");
Assert(minute.Next(start.AddMinutes(41)) == start.AddMinutes(45), "Missed intervals coalesce without drifting");
Assert(new ReminderSchedule(Every: 3, Unit: "hours", StartsAt: start).Next(start) == start.AddHours(3), "Hourly cadence is retained");
var daily = new ReminderSchedule(Every: 2, Unit: "days", TimeZone: "America/New_York", StartsAt: Utc("2026-10-31T13:00:00Z"));
Assert(daily.Next(daily.StartsAt) == Utc("2026-11-02T14:00:00Z"), "Every N days retains local time across DST");
var weekly = new ReminderSchedule(Mode: "weekly", Days: [0], Time: "01:30", TimeZone: "America/New_York", StartsAt: Utc("2026-10-31T00:00:00Z"));
Assert(weekly.Next(weekly.StartsAt) == Utc("2026-11-01T05:30:00Z"), "Repeated weekly hour chooses the first occurrence");
Assert(weekly.Next(Utc("2026-11-01T06:00:00Z")) == Utc("2026-11-08T06:30:00Z"), "Repeated weekly hour never sends twice");
var spring = weekly with { Time = "02:30", StartsAt = Utc("2026-03-07T00:00:00Z") };
Assert(spring.Next(spring.StartsAt) == Utc("2026-03-08T07:00:00Z"), "Missing local hour advances to the first valid minute");
Assert((minute with { Mode = "once" }).Next(start) == null, "One-time schedule has no second occurrence");
foreach (var invalid in new[] { minute with { Every = 0 }, minute with { Mode = "unknown" }, minute with { Unit = "seconds" }, minute with { Mode = "weekly", Days = [] }, minute with { Days = [1,1] }, minute with { Days = [8] }, minute with { Time = "24:00" }, minute with { TimeZone = "unknown-zone" } }) {
    try { invalid.Validate(); throw new Exception("Expected invalid schedule"); } catch (InputError) { Assert(true, "Invalid schedule rejected"); }
}
// In-memory database belongs exclusively to this test process; no developer data is opened.
using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
var clock = new ReminderClock(start);
var space = new Space { Name = "Shared" };
var owner = new User { Name = "Owner", Email = "owner@test", Username = "owner", Role = "Admin" };
var member = new User { Name = "Member", Email = "member@test", Username = "member" };
var outsider = new User { Name = "Outsider", Email = "outsider@test", Username = "outsider" };
space.OwnerId = owner.Id;
var services = new ServiceCollection();
services.AddScoped<SpaceScope>().AddDbContext<AppDb>(o => o.UseSqlite(connection));
using var provider = services.BuildServiceProvider();
var worker = new ReminderWorker(provider.GetRequiredService<IServiceScopeFactory>(), clock, new ChangeFeed(new ChatPresence(clock)), new PushWakeup(), NullLogger<ReminderWorker>.Instance);
var project = new Project { SpaceId = space.Id, Name = "Project" };
var open = new TaskStatus { ProjectId = project.Id, Name = "Open" };
var done = new TaskStatus { ProjectId = project.Id, Name = "Done", IsDone = true };
var task = new WorkItem { ProjectId = project.Id, StatusId = open.Id, Title = "Resolve me", CreatedById = owner.Id, AssigneeId = member.Id };
var device = new PushDevice { UserId = member.Id, EndpointHash = "fixture", Endpoint = "https://fcm.googleapis.com/fixture" };
Reminder NewReminder(string audience, Guid? taskId = null) => new() {
    SpaceId = space.Id, CreatedById = owner.Id, Title = "Reminder title", Message = "Reminder message", Audience = audience,
    WorkItemId = taskId, ScheduleJson = (minute with { Every = 1 }).Serialize(), NextRunAt = clock.GetUtcNow().UtcDateTime
};
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); await db.Database.EnsureCreatedAsync();
    db.Roles.AddRange(new AppRole { Name = "Admin" }, new AppRole { Name = "User" });
    foreach (var page in Access.Pages) db.PagePermissions.Add(new PagePermission { RoleName = "User", Page = page });
    db.Users.AddRange(owner, member, outsider); db.Spaces.Add(space); db.SpaceMembers.Add(new SpaceMember { SpaceId = space.Id, UserId = member.Id });
    db.Projects.Add(project); db.Statuses.AddRange(open, done); db.Tasks.Add(task); db.PushDevices.Add(device);
    db.Reminders.Add(NewReminder("workspace")); await db.SaveChangesAsync();
}
await worker.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Assert(await db.Notifications.CountAsync() == 2 && !await db.Notifications.AnyAsync(n => n.UserId == outsider.Id), "Workspace reminders include creator and current members, never outsiders");
    Assert(await db.PushDeliveries.CountAsync() == 1, "Unopened subscribed device receives durable delivery");
    var notice = await db.Notifications.SingleAsync(n => n.UserId == member.Id);
    Assert(notice.WorkItemId == null && notice.ReminderId != null && notice.TaskTitle == "Reminder title" && notice.Message == "Reminder message", "Standalone notice retains title/message without task or status");
    Assert(ReminderAccess.Url(notice).EndsWith("#reminders/" + notice.ReminderId), "Standalone push targets reminder view");
    notice.CreatedAt = DateTime.UtcNow; await db.SaveChangesAsync();
    var preview = new PushPreview(new EphemeralDataProtectionProvider());
    Assert(await preview.Get(db, notice.Id, false, preview.Create(device, notice.Id, false), default) != null, "Background capability reads standalone reminder without browser cookies");
    Assert(await NotificationEvents.Visible(db, outsider.Id).CountAsync() == 0 && await NotificationEvents.Visible(db, member.Id).CountAsync() == 1, "Notice visibility rechecks scope independently of active workspace");
}
await worker.Dispatch(default);
using (var scope = provider.CreateScope()) Assert(await scope.ServiceProvider.GetRequiredService<AppDb>().Notifications.CountAsync() == 2, "Repeated dispatch does not duplicate an occurrence");
clock.Now = start.AddHours(6); await worker.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Assert(await db.Notifications.CountAsync() == 4, "Outage creates one notice per recipient instead of replaying six hours");
    await db.Reminders.IgnoreQueryFilters().ExecuteUpdateAsync(p => p.SetProperty(r => r.Enabled, false));
    Assert(!await ReminderAccess.CanDeliver(db, (await db.Reminders.IgnoreQueryFilters().SingleAsync()).Id, member.Id, default), "Pause suppresses queued pushes");
    db.Reminders.Add(NewReminder("assignee", task.Id)); await db.SaveChangesAsync();
}
await worker.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Assert(await db.Notifications.CountAsync(n => n.WorkItemId == task.Id) == 1 && await db.Notifications.AnyAsync(n => n.WorkItemId == task.Id && n.UserId == member.Id), "Task reminder follows current assignee");
    await db.Tasks.IgnoreQueryFilters().Where(t => t.Id == task.Id).ExecuteUpdateAsync(p => p.SetProperty(t => t.StatusId, done.Id));
    var reminder = await db.Reminders.IgnoreQueryFilters().SingleAsync(r => r.WorkItemId == task.Id);
    Assert(!await ReminderAccess.CanDeliver(db, reminder.Id, member.Id, default), "Resolved task suppresses queued pushes");
}
clock.Now = clock.Now.AddMinutes(1); await worker.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Assert(await db.Notifications.CountAsync(n => n.WorkItemId == task.Id) == 1, "Resolved task receives no scheduled notices");
    await db.Tasks.IgnoreQueryFilters().Where(t => t.Id == task.Id).ExecuteUpdateAsync(p => p.SetProperty(t => t.StatusId, open.Id).SetProperty(t => t.AssigneeId, (Guid?)owner.Id));
}
clock.Now = clock.Now.AddMinutes(1); await worker.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    var notice = await db.Notifications.SingleAsync(n => n.WorkItemId == task.Id && n.UserId == owner.Id);
    Assert(notice.TaskTitle == task.Title && ReminderAccess.Url(notice).Contains("&task=" + task.Id + "#inbox"), "Reopened reassigned task resumes with current title and task deep link");
    await db.Tasks.IgnoreQueryFilters().Where(t => t.Id == task.Id).ExecuteUpdateAsync(p => p.SetProperty(t => t.AssigneeId, (Guid?)null));
}
clock.Now = clock.Now.AddMinutes(1); await worker.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Assert(await db.Notifications.CountAsync(n => n.WorkItemId == task.Id) == 4, "Unassigned task reminder reaches all eligible members");
    await db.PagePermissions.Where(p => p.RoleName == "User" && p.Page == "reminders").ExecuteUpdateAsync(p => p.SetProperty(p => p.Allowed, false));
    Assert(!await ReminderAccess.ForRecipient(db, member.Id).AnyAsync(), "Page revocation suppresses visibility and delivery");
    await db.PagePermissions.Where(p => p.RoleName == "User" && p.Page == "reminders").ExecuteUpdateAsync(p => p.SetProperty(p => p.Allowed, true));
    await db.SpaceMembers.Where(m => m.UserId == member.Id).ExecuteDeleteAsync();
    Assert(!await ReminderAccess.ForRecipient(db, member.Id).AnyAsync(), "Leaving workspace removes access and delivery");
    await db.Reminders.IgnoreQueryFilters().ExecuteDeleteAsync();
    Assert(await db.Notifications.CountAsync() == 0 && await db.PushDeliveries.CountAsync() == 0, "Deletion cancels reminder history and durable outbox atomically");
    var legacy = new TaskNotification { UserId = owner.Id, SpaceId = space.Id, WorkItemId = task.Id, TaskTitle = "Retained task", Message = "Retained message" };
    db.Notifications.Add(legacy); db.PushDeliveries.Add(new PushDelivery { NotificationId = legacy.Id, DeviceId = device.Id }); await db.SaveChangesAsync();
    // Reconstruct only this in-memory fixture's pre-reminder schema, preserving its outbox.
    await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys=OFF");
    await db.Database.ExecuteSqlRawAsync("CREATE TABLE Notifications_Legacy (Id TEXT PRIMARY KEY, UserId TEXT NOT NULL, SpaceId TEXT NOT NULL, WorkItemId TEXT NOT NULL, Kind TEXT NOT NULL, TaskTitle TEXT NOT NULL, Message TEXT NOT NULL, CreatedAt TEXT NOT NULL, ReadAt TEXT NULL); INSERT INTO Notifications_Legacy SELECT Id,UserId,SpaceId,WorkItemId,Kind,TaskTitle,Message,CreatedAt,ReadAt FROM Notifications; DROP TABLE Notifications; ALTER TABLE Notifications_Legacy RENAME TO Notifications; DROP TABLE Reminders;");
    await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys=ON");
    await ReminderUpgrade.Apply(db); await ReminderUpgrade.Apply(db); db.ChangeTracker.Clear();
    Assert(await db.Notifications.AnyAsync(n => n.Id == legacy.Id && n.WorkItemId == task.Id && n.Message == "Retained message" && n.ReminderId == null), "SQLite upgrade preserves task notice IDs, titles and messages idempotently");
    Assert(await db.PushDeliveries.AnyAsync(d => d.NotificationId == legacy.Id), "SQLite rebuild preserves queued deliveries");
    var fresh = NewReminder("workspace"); db.Reminders.Add(fresh);
    db.Notifications.Add(new TaskNotification { UserId = owner.Id, SpaceId = space.Id, ReminderId = fresh.Id, TaskTitle = "Standalone after upgrade", Message = "Fresh message" });
    await db.SaveChangesAsync();
    Assert(await db.Notifications.AnyAsync(n => n.ReminderId == fresh.Id && n.WorkItemId == null), "Legacy database accepts new independent reminder notifications");
    await using var command = connection.CreateCommand(); command.CommandText = "PRAGMA foreign_key_check";
    await using var reader = await command.ExecuteReaderAsync(); Assert(!await reader.ReadAsync(), "SQLite upgraded foreign keys remain valid");
}
Console.WriteLine($"{checks} reminder checks passed. No external push provider was contacted.");
sealed class ReminderClock(DateTime now) : TimeProvider { public DateTime Now { get; set; } = now; public override DateTimeOffset GetUtcNow() => new(DateTime.SpecifyKind(Now, DateTimeKind.Utc)); }
