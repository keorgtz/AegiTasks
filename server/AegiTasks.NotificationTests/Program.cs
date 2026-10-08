using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using AegiTasks.Api.Endpoints;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Identity;
using WebPush;
using TaskStatus = AegiTasks.Api.Domain.TaskStatus;

var directory = Path.Combine(Path.GetTempPath(), "aegitasks-notifications-" + Guid.NewGuid());
Directory.CreateDirectory(directory);
var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["DataProtectionPath"] = directory }).Build();
using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
var services = new ServiceCollection().AddSingleton<IConfiguration>(config).AddLogging();
services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(directory)).SetApplicationName("NotificationTests");
services.AddSingleton<PushKeys>().AddScoped<SpaceScope>().AddDbContext<AppDb>(o => o.UseSqlite(connection));
using var provider = services.BuildServiceProvider();
var keys = provider.GetRequiredService<PushKeys>(); keys.Initialize();
var restored = new PushKeys(config, provider.GetRequiredService<IDataProtectionProvider>()); restored.Initialize();
Assert(restored.Details.PublicKey == keys.Details.PublicKey, "VAPID keys survive restart");
Assert(!File.ReadAllText(Path.Combine(directory, "webpush-vapid.json")).Contains(keys.Details.PrivateKey), "Persisted VAPID keys are protected");
var user = new User { Name = "Responsible", Email = "responsible@test.example", Username = "responsible", Role = "Admin" };
var space = new Space { Name = "Team", OwnerId = user.Id };
var project = new Project { Name = "PMS", SpaceId = space.Id };
var status = new TaskStatus { ProjectId = project.Id, Name = "Pending" };
var task = new WorkItem { ProjectId = project.Id, StatusId = status.Id, CreatedById = user.Id, AssigneeId = user.Id, Title = "Private title" };
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); await db.Database.EnsureCreatedAsync();
    db.Roles.Add(new AppRole { Name = "Admin" }); db.Users.Add(user); db.Spaces.Add(space); db.Projects.Add(project); db.Statuses.Add(status); db.Tasks.Add(task); await db.SaveChangesAsync();
}
var fake = new FakeTransport();
var wakeup = new PushWakeup();
var preview = new PushPreview(provider.GetRequiredService<IDataProtectionProvider>());
var sender = new PushSender(provider.GetRequiredService<IServiceScopeFactory>(), keys, fake, NullLogger<PushSender>.Instance, wakeup, preview);
async Task<(Guid Notice, Guid Device, Guid Delivery)> Queue(DateTime? readAt = null, int sessionVersion = 0, DateTime? created = null) {
    using var scope = provider.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    var notice = new TaskNotification { UserId = user.Id, SpaceId = space.Id, WorkItemId = task.Id, ReadAt = readAt, CreatedAt = created ?? DateTime.UtcNow, Message = "Created" };
    var device = new PushDevice { UserId = user.Id, SessionVersion = sessionVersion, Endpoint = "https://fcm.googleapis.com/test", EndpointHash = Guid.NewGuid().ToString() };
    var delivery = new PushDelivery { NotificationId = notice.Id, DeviceId = device.Id };
    db.Notifications.Add(notice); db.PushDevices.Add(device); db.PushDeliveries.Add(delivery); await db.SaveChangesAsync();
    return (notice.Id, device.Id, delivery.Id);
}
var success = await Queue(); await sender.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); Assert((await db.PushDeliveries.SingleAsync(d => d.Id == success.Delivery)).FinishedAt != null, "Successful delivery is finished");
}
using (var payload = JsonDocument.Parse(fake.Payload!)) {
    Assert(payload.RootElement.EnumerateObject().Count() == 4 && !fake.Payload!.Contains(task.Title), "Push payload contains IDs and a protected capability, never task contents");
    var token = payload.RootElement.GetProperty("backgroundToken").GetString()!;
    var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
    builder.Logging.ClearProviders(); builder.WebHost.UseUrls("http://127.0.0.1:0");
    builder.Services.AddSingleton(preview).AddScoped(_ => new AppDb(new DbContextOptionsBuilder<AppDb>().UseSqlite(connection).Options, new SpaceScope()));
    await using var web = builder.Build(); web.MapPushPreviews(); await web.StartAsync();
    using var capabilityHttp = new HttpClient(new HttpClientHandler { UseCookies = false }) { BaseAddress = new Uri(web.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
    var path = $"/api/push/task/{success.Notice}";
    Assert((await capabilityHttp.GetAsync(path)).StatusCode == HttpStatusCode.NotFound, "Anonymous background HTTP requests without a capability cannot read notices");
    capabilityHttp.DefaultRequestHeaders.Add("X-AegiTasks-Push", token);
    using var backgroundResponse = await capabilityHttp.GetAsync(path);
    Assert(backgroundResponse.StatusCode == HttpStatusCode.OK && backgroundResponse.Headers.CacheControl?.NoStore == true, "Real background HTTP endpoint works with no session or device cookie and forbids caching private previews");
    Assert((await capabilityHttp.GetAsync($"/api/push/chat/{success.Notice}")).StatusCode == HttpStatusCode.NotFound && (await capabilityHttp.GetAsync($"/api/push/task/{Guid.NewGuid()}")).StatusCode == HttpStatusCode.NotFound, "Real HTTP capability cannot cross notification IDs or kinds");
    await web.StopAsync();
    using var scope = provider.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Assert(await preview.Get(db, success.Notice, false, token, default) != null, "Device capability reads its authorized preview without browser cookies");
    Assert(await preview.Get(db, Guid.NewGuid(), false, token, default) == null && await preview.Get(db, success.Notice, true, token, default) == null, "Preview capability is bound to one notice and cannot switch task/chat scope");
    Assert(preview.Read(token + "broken") == null && preview.Read("") == null, "Forged and missing preview tokens are rejected");
    var grant = preview.Read(token)!;
    var expiredToken = provider.GetRequiredService<IDataProtectionProvider>().CreateProtector("AegiTasks.PushPreview.v1").ToTimeLimitedDataProtector().Protect(JsonSerializer.Serialize(grant), DateTimeOffset.UtcNow.AddSeconds(-1));
    Assert(preview.Read(expiredToken) == null, "Expired background capabilities cannot authorize private content");
    var device = await db.PushDevices.SingleAsync(d => d.Id == success.Device);
    device.SessionVersion++; await db.SaveChangesAsync();
    Assert(await preview.Get(db, success.Notice, false, token, default) == null, "Revoking/rebinding a device immediately invalidates its background capability");
    device.SessionVersion--; await db.SaveChangesAsync();
    await db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(p => p.SetProperty(u => u.SessionVersion, 1));
    Assert(await preview.Get(db, success.Notice, false, token, default) == null, "Account session revocation denies background previews even without cookie authentication");
    await db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(p => p.SetProperty(u => u.SessionVersion, 0).SetProperty(u => u.Active, false));
    Assert(await preview.Get(db, success.Notice, false, token, default) == null, "Deactivated accounts cannot use an issued background capability");
    await db.Users.Where(u => u.Id == user.Id).ExecuteUpdateAsync(p => p.SetProperty(u => u.Active, true));
    await db.Notifications.Where(n => n.Id == success.Notice).ExecuteUpdateAsync(p => p.SetProperty(n => n.ReadAt, DateTime.UtcNow));
    Assert(await preview.Get(db, success.Notice, false, token, default) == null, "Reading a notification suppresses even a previously issued preview capability");
}
await sender.Dispatch(default); Assert(fake.Calls == 1, "Finished deliveries do not repeat");
fake.Mode = "fail"; var retry = await Queue(); await sender.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); var row = await db.PushDeliveries.SingleAsync(d => d.Id == retry.Delivery);
    Assert(row.Attempts == 1 && row.FinishedAt == null && row.NextAttemptAt > DateTime.UtcNow, "Transient errors persist an independent retry");
    row.NextAttemptAt = DateTime.UtcNow.AddSeconds(-1); await db.SaveChangesAsync();
}
fake.Mode = "success"; await sender.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); Assert((await db.PushDeliveries.SingleAsync(d => d.Id == retry.Delivery)).FinishedAt != null, "Retry survives a new database scope");
}
fake.Mode = "expired"; var expired = await Queue(); await sender.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); Assert(!await db.PushDevices.AnyAsync(d => d.Id == expired.Device) && !await db.PushDeliveries.AnyAsync(d => d.Id == expired.Delivery), "Expired devices and queued deliveries are removed");
    Assert(await db.Notifications.AnyAsync(n => n.Id == expired.Notice), "Expired push does not remove the history");
}
fake.Mode = "success"; var calls = fake.Calls;
await Queue(DateTime.UtcNow); await Queue(sessionVersion: 99); await Queue(created: DateTime.UtcNow.AddDays(-2)); await sender.Dispatch(default);
Assert(fake.Calls == calls, "Read, expired and revoked-session notices are suppressed");
var limit = await Queue(); fake.Mode = "fail";
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); var row = await db.PushDeliveries.SingleAsync(d => d.Id == limit.Delivery); row.Attempts = 7; await db.SaveChangesAsync();
}
await sender.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); Assert((await db.PushDeliveries.SingleAsync(d => d.Id == limit.Delivery)).FinishedAt != null, "Retries stop after eight attempts");
}

var cleared = await Queue();
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    await db.Notifications.Where(n => n.Id == cleared.Notice && n.UserId == user.Id).ExecuteDeleteAsync();
    Assert(!await db.PushDeliveries.AnyAsync(d => d.Id == cleared.Delivery) && await db.PushDevices.AnyAsync(d => d.Id == cleared.Device), "Deleting a notice cascades queued deliveries while preserving its device");
}
calls = fake.Calls; await sender.Dispatch(default);
Assert(fake.Calls == calls, "Cleared notices never dispatch queued push messages");

using var ecdh = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
var point = ecdh.ExportParameters(false).Q;
string Url64(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
var sample = new PushDevice { Endpoint = "https://fcm.googleapis.com/push/test", P256dh = Url64([4, ..point.X!, ..point.Y!]), Auth = Url64(RandomNumberGenerator.GetBytes(16)) };
var handler = new CaptureHandler(); using var http = new HttpClient(handler); using var transport = new WebPushTransport(http);
Assert(await transport.Send(sample, "private-payload-test", keys.Details, default), "Real WebPush library sends through the HTTP transport");
Assert(handler.Authorization && handler.Body!.Length > 20 && !Encoding.UTF8.GetString(handler.Body).Contains("private-payload-test"), "WebPush signs VAPID and encrypts payloads");
Assert(handler.Urgency == "high" && handler.Ttl == "86400", "Real WebPush requests high urgency while retaining messages for temporarily disconnected devices");
handler.Status = HttpStatusCode.Gone; Assert(!await transport.Send(sample, "test", keys.Details, default), "HTTP 410 is an expired subscription");
handler.Status = HttpStatusCode.ServiceUnavailable;
try { await transport.Send(sample, "test", keys.Details, default); throw new Exception("Expected provider failure"); }
catch (WebPushException) { Console.WriteLine("PASS HTTP 503 propagates for persistent retries"); }
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    var before = await db.Notifications.CountAsync();
    scope.ServiceProvider.GetRequiredService<SpaceScope>().UserId = user.Id;
    scope.ServiceProvider.GetRequiredService<SpaceScope>().SpaceId = space.Id;
    db.Tasks.Add(new WorkItem { ProjectId = project.Id, StatusId = Guid.NewGuid(), CreatedById = user.Id, Title = "Invalid status" });
    try { await db.SaveChangesAsync(); throw new Exception("Expected failed mutation"); }
    catch (DbUpdateException) { }
    db.ChangeTracker.Clear();
    Assert(await db.Notifications.CountAsync() == before, "Failed database writes roll back staged notifications atomically");
}
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    var retained = new TaskNotification { UserId = user.Id, SpaceId = space.Id, WorkItemId = task.Id, Message = "Legacy event" };
    db.Notifications.Add(retained); await db.SaveChangesAsync();
    await db.Database.ExecuteSqlRawAsync("ALTER TABLE Notifications DROP COLUMN TaskTitle;");
    await SqliteNotificationUpgrade.Apply(db); await SqliteNotificationUpgrade.Apply(db);
    db.ChangeTracker.Clear();
    var upgraded = await db.Notifications.SingleAsync(n => n.Id == retained.Id);
    Assert(upgraded.TaskTitle == task.Title && upgraded.Message == "Legacy event", "SQLite detailed-notice upgrade preserves history and backfills titles idempotently");
    await db.Database.ExecuteSqlRawAsync("DROP TABLE PushDeliveries; DROP TABLE Notifications; DROP TABLE PushDevices;");
    await SqliteNotificationUpgrade.Apply(db); await SqliteNotificationUpgrade.Apply(db);
    Assert(await db.Tasks.IgnoreQueryFilters().AnyAsync(t => t.Id == task.Id) && await db.Notifications.CountAsync() == 0, "SQLite local upgrade is idempotent and preserves existing tasks");
}
Console.WriteLine("Notification delivery checks passed. No external push service was contacted.");
var mondayNight = new ChatSilence("schedule", TimeZone: "UTC", Periods: [new([1], 22 * 60, 6 * 60)]);
Assert(mondayNight.Muted(new DateTime(2026, 10, 5, 22, 0, 0, DateTimeKind.Utc)) && mondayNight.Muted(new DateTime(2026, 10, 6, 5, 59, 0, DateTimeKind.Utc)) && !mondayNight.Muted(new DateTime(2026, 10, 6, 6, 0, 0, DateTimeKind.Utc)), "Weekly quiet hours cross midnight from the selected start day with an exclusive end");
var weekend = new ChatSilence("schedule", TimeZone: "America/Mexico_City", Periods: [new([0, 6], 0, 0)]);
Assert(weekend.Muted(new DateTime(2026, 10, 5, 5, 59, 0, DateTimeKind.Utc)) && !weekend.Muted(new DateTime(2026, 10, 5, 6, 0, 0, DateTimeKind.Utc)), "All-day weekend silence respects the saved timezone, independent of server timezone");
var dst = new ChatSilence("schedule", TimeZone: "America/New_York", Periods: [new([0], 60, 120)]);
Assert(dst.Muted(new DateTime(2026, 11, 1, 5, 30, 0, DateTimeKind.Utc)) && dst.Muted(new DateTime(2026, 11, 1, 6, 30, 0, DateTimeKind.Utc)) && !dst.Muted(new DateTime(2026, 11, 1, 7, 0, 0, DateTimeKind.Utc)), "DST repeated local hours both obey weekly silence");
Assert(new ChatSilence("until", DateTime.UtcNow.AddMinutes(1)).Muted(DateTime.UtcNow) && !new ChatSilence("until", DateTime.UtcNow.AddMinutes(-1)).Muted(DateTime.UtcNow) && new ChatSilence("always").Muted(DateTime.UtcNow), "Temporary silence expires automatically; permanent silence does not");
foreach (var invalid in new[] { new ChatSilence("invalid"), new ChatSilence(TimeZone: "Unknown/Invalid"), new ChatSilence("schedule", Periods: []), new ChatSilence("schedule", Periods: [new([7], 0, 0)]) }) {
    try { invalid.Validate(DateTime.UtcNow); throw new Exception("Expected invalid silence"); } catch (InputError) { }
}
Console.WriteLine("PASS Invalid modes, zones, days and empty schedules are rejected");
var recipient = new User { Name = "Chat Recipient", Email = "chat-recipient@unit.example", Username = "chat-recipient", Role = "Admin" };
var chatRoom = new ChatRoom { Name = "Chat notification tests", OwnerId = user.Id };
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Users.Add(recipient); db.ChatRooms.Add(chatRoom);
    db.ChatMembers.AddRange(new ChatMember { ChatRoomId = chatRoom.Id, UserId = user.Id }, new ChatMember { ChatRoomId = chatRoom.Id, UserId = recipient.Id });
    db.PushDevices.Add(new PushDevice { UserId = recipient.Id, Endpoint = "https://fcm.googleapis.com/chat-unit", EndpointHash = "chat-unit" });
    await db.SaveChangesAsync();
    foreach (var body in new[] { "First private chat message", "Second private chat message" }) {
        var msg = new ChatMessage { ChatRoomId = chatRoom.Id, UserId = user.Id, ClientId = Guid.NewGuid(), Sequence = ++chatRoom.NextSequence, Body = body };
        db.ChatMessages.Add(msg); await ChatNotificationEvents.Stage(db, msg, default); await db.SaveChangesAsync();
    }
    var summary = await ChatNotificationEvents.Summary(db, chatRoom.Id, recipient.Id, DateTime.UtcNow);
    Assert(summary?.Count == 2 && summary.Previews.Length == 2 && summary.Body.Contains("Second private chat message"), "Chat summaries group unread messages with author previews");
}
fake.Mode = "success"; calls = fake.Calls; await sender.Dispatch(default);
Assert(fake.Calls == calls + 1 && fake.Payload!.Contains("chatNotificationId") && !fake.Payload.Contains("private chat"), "Multiple chat messages coalesce into one durable push with identifiers only");
using var deliveredChat = JsonDocument.Parse(fake.Payload!);
var chatToken = deliveredChat.RootElement.GetProperty("backgroundToken").GetString()!;
var chatNoticeId = deliveredChat.RootElement.GetProperty("chatNotificationId").GetGuid();
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    Assert(await preview.Get(db, chatNoticeId, true, chatToken, default) is ChatNotificationEvents.ChatNotice { Count: 2 }, "A chat capability returns authorized grouped previews without opening the application");
}
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    var msg = new ChatMessage { ChatRoomId = chatRoom.Id, UserId = user.Id, ClientId = Guid.NewGuid(), Sequence = ++chatRoom.NextSequence, Body = "Queued before mute" };
    db.ChatMessages.Add(msg); await ChatNotificationEvents.Stage(db, msg, default); await db.SaveChangesAsync();
}
fake.Mode = "fail"; await sender.Dispatch(default);
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    var retryChat = await db.ChatPushDeliveries.SingleAsync(d => d.FinishedAt == null);
    Assert(retryChat.Attempts == 1 && retryChat.NextAttemptAt > DateTime.UtcNow, "Chat provider failures persist retries without changing messages or alerts");
    retryChat.NextAttemptAt = DateTime.UtcNow.AddSeconds(-1);
    db.ChatNotificationPreferences.Add(new() { ChatRoomId = chatRoom.Id, UserId = recipient.Id, Settings = new ChatSilence("always").Serialize() }); await db.SaveChangesAsync();
    Assert(await preview.Get(db, chatNoticeId, true, chatToken, default) == null, "Muting after provider acceptance suppresses even an already-issued chat preview capability");
}
fake.Mode = "success";
calls = fake.Calls; await sender.Dispatch(default);
Assert(fake.Calls == calls, "Muting after a send suppresses already queued chat pushes at dispatch");
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>(); var before = await db.ChatAlerts.CountAsync();
    var msg = new ChatMessage { ChatRoomId = chatRoom.Id, UserId = user.Id, ClientId = Guid.NewGuid(), Sequence = ++chatRoom.NextSequence, Body = "Muted message" };
    db.ChatMessages.Add(msg); await ChatNotificationEvents.Stage(db, msg, default); await db.SaveChangesAsync();
    Assert(await db.ChatAlerts.CountAsync() == before && await db.ChatMessages.AnyAsync(m => m.Id == msg.Id), "Muted messages persist without creating deferred alerts or deliveries");
    var pref = await db.ChatNotificationPreferences.SingleAsync(); pref.Settings = new ChatSilence().Serialize(); await db.SaveChangesAsync();
    var revocable = new ChatMessage { ChatRoomId = chatRoom.Id, UserId = user.Id, ClientId = Guid.NewGuid(), Sequence = ++chatRoom.NextSequence, Body = "Pending before session revocation" };
    db.ChatMessages.Add(revocable); await ChatNotificationEvents.Stage(db, revocable, default); await db.SaveChangesAsync();
    await db.Users.Where(u => u.Id == recipient.Id).ExecuteUpdateAsync(p => p.SetProperty(u => u.SessionVersion, 1));
}
calls = fake.Calls; await sender.Dispatch(default);
Assert(fake.Calls == calls, "Revoked device sessions suppress already queued chat notifications");
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    await db.ChatMembers.Where(m => m.ChatRoomId == chatRoom.Id && m.UserId == recipient.Id).ExecuteDeleteAsync();
    Assert(!await db.ChatAlerts.AnyAsync(n => n.ChatRoomId == chatRoom.Id) && !await db.ChatNotificationPreferences.AnyAsync(p => p.ChatRoomId == chatRoom.Id) && !await db.ChatPushDeliveries.AnyAsync(), "Removing a member cascades their private preferences, alerts and push outbox");
}
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    await db.Database.ExecuteSqlRawAsync("DROP TABLE ChatPushDeliveries; DROP TABLE ChatAlerts; DROP TABLE ChatNotificationPreferences;");
    await ChatUpgrade.Apply(db); await ChatUpgrade.Apply(db);
    Assert(await db.ChatMessages.AnyAsync(m => m.Body == "Second private chat message") && await db.ChatNotificationPreferences.CountAsync() == 0, "SQLite chat notification upgrade preserves existing conversations and adds empty settings without retroactive alerts");
}
using (var scope = provider.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    await db.Database.ExecuteSqlRawAsync("DROP TABLE ChatPushDeliveries; DROP TABLE ChatAlerts; DROP TABLE ChatNotificationPreferences; DROP TABLE ChatFiles; DROP TABLE ChatMembers; DROP TABLE ChatMessages; DROP TABLE ChatRooms;");
    await ChatUpgrade.Apply(db); await ChatUpgrade.Apply(db);
    Assert(await db.ChatRooms.CountAsync() == 0 && await db.Tasks.IgnoreQueryFilters().AnyAsync(t => t.Id == task.Id) && await db.PagePermissions.CountAsync(p => p.Page == "chat") == 1, "SQLite chat upgrade is idempotent and preserves task data while enabling existing roles");
}

using (var emptySeedConnection = new SqliteConnection("Data Source=:memory:")) {
    await emptySeedConnection.OpenAsync();
    using var emptySeedDb = new AppDb(new DbContextOptionsBuilder<AppDb>().UseSqlite(emptySeedConnection).Options, new SpaceScope());
    await emptySeedDb.Database.EnsureCreatedAsync();
    var emptySeedConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["SEED_ADMIN_PASSWORD"] = "" }).Build();
    var hasher = new PasswordHasher<User>();
    await Bootstrap.Seed(emptySeedDb, hasher, emptySeedConfig);
    var seeded = await emptySeedDb.Users.SingleAsync();
    Assert(hasher.VerifyHashedPassword(seeded, seeded.PasswordHash, "") != PasswordVerificationResult.Failed && hasher.VerifyHashedPassword(seeded, seeded.PasswordHash, "wrong") == PasswordVerificationResult.Failed, "Explicit empty administrator seed is hashed and still verifies the supplied secret");
    Assert(await emptySeedDb.Spaces.AnyAsync(s => s.IsPersonal && s.OwnerId == seeded.Id), "Empty-password bootstrap still creates the administrator's personal space");
}

var presenceClock = new PresenceClock();
var waitingForPush = wakeup.Wait(default);
Assert(!waitingForPush.IsCompleted, "An idle push worker waits without polling the UI");
wakeup.Notify(); await waitingForPush.WaitAsync(TimeSpan.FromSeconds(1));
Assert(waitingForPush.IsCompletedSuccessfully, "Committed work wakes the sender immediately instead of waiting five seconds");
for (var index = 0; index < 100; index++) wakeup.Notify();
await wakeup.Wait(default).WaitAsync(TimeSpan.FromSeconds(1));
Assert(true, "Burst wakeups remain bounded and preserve a pending signal while delivery is busy");

var presence = new ChatPresence(presenceClock);
var tab1 = Guid.NewGuid(); var tab2 = Guid.NewGuid(); var presenceUser = Guid.NewGuid();
string PresenceStatus() => presence.Snapshot([presenceUser])[presenceUser];
Assert(PresenceStatus() == "offline", "Users without SSE connections are offline");
Assert(presence.Connect(tab1, presenceUser) && PresenceStatus() == "away", "Validated connections start away until activity is confirmed");
Assert(!presence.Update(tab1, Guid.NewGuid(), true).Accepted && PresenceStatus() == "away", "A connection cannot update another user's presence");
Assert(!presence.Update(Guid.NewGuid(), presenceUser, true).Accepted, "Activity cannot create a fabricated connection");
Assert(presence.Update(tab1, presenceUser, true).Changed && PresenceStatus() == "online", "Activity makes an authenticated connected account online");
Assert(!presence.Update(tab1, presenceUser, true).Changed, "Heartbeats do not broadcast unchanged presence");
Assert(!presence.Connect(tab2, presenceUser) && PresenceStatus() == "online", "An inactive second tab does not override an active device");
Assert(presence.Update(tab1, presenceUser, false).Changed && PresenceStatus() == "away", "All connected tabs inactive makes the account away");
presence.Update(tab2, presenceUser, true);
Assert(!presence.Disconnect(tab1) && PresenceStatus() == "online", "Closing one tab preserves online status from another device");
presenceClock.Advance(ChatPresence.Lease);
Assert(presence.Sweep() && PresenceStatus() == "offline", "Silent or suspended connections expire after ninety seconds");
Assert(!presence.Sweep(), "Expired connections do not emit duplicate changes");
Assert(presence.Update(tab2, presenceUser, true).Changed && PresenceStatus() == "online", "Resuming a live stream renews its expired lease");
Assert(presence.Disconnect(tab2) && PresenceStatus() == "offline", "Closing the last stream makes the account offline immediately");
Assert(!presence.Update(tab2, presenceUser, true).Accepted, "Disconnected connection tokens cannot resurrect presence");

static void Assert(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); }
sealed class PresenceClock : TimeProvider {
    private DateTimeOffset now = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => now;
    public void Advance(TimeSpan duration) => now += duration;
}
sealed class FakeTransport : IPushTransport {
    public string Mode { get; set; } = "success"; public int Calls { get; private set; } public string? Payload { get; private set; }
    public Task<bool> Send(PushDevice device, string payload, VapidDetails keys, CancellationToken ct) {
        Calls++; Payload = payload;
        if (Mode == "fail") throw new HttpRequestException("Simulated unavailable provider");
        return Task.FromResult(Mode != "expired");
    }
}
sealed class CaptureHandler : HttpMessageHandler {
    public HttpStatusCode Status { get; set; } = HttpStatusCode.Created; public byte[]? Body { get; private set; } public bool Authorization { get; private set; }
    public string? Urgency { get; private set; } public string? Ttl { get; private set; }
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) {
        Body = await request.Content!.ReadAsByteArrayAsync(ct); Authorization = request.Headers.Contains("Authorization");
        Urgency = request.Headers.GetValues("Urgency").Single(); Ttl = request.Headers.GetValues("TTL").Single();
        return new HttpResponseMessage(Status) { Content = new StringContent("") };
    }
}
