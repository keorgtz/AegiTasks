using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
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
var sender = new PushSender(provider.GetRequiredService<IServiceScopeFactory>(), keys, fake, NullLogger<PushSender>.Instance);
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
using (var payload = JsonDocument.Parse(fake.Payload!)) Assert(payload.RootElement.EnumerateObject().Count() == 2 && !fake.Payload!.Contains(task.Title), "Push payload contains identifiers only");
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

using var ecdh = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
var point = ecdh.ExportParameters(false).Q;
string Url64(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
var sample = new PushDevice { Endpoint = "https://fcm.googleapis.com/push/test", P256dh = Url64([4, ..point.X!, ..point.Y!]), Auth = Url64(RandomNumberGenerator.GetBytes(16)) };
var handler = new CaptureHandler(); using var http = new HttpClient(handler); using var transport = new WebPushTransport(http);
Assert(await transport.Send(sample, "private-payload-test", keys.Details, default), "Real WebPush library sends through the HTTP transport");
Assert(handler.Authorization && handler.Body!.Length > 20 && !Encoding.UTF8.GetString(handler.Body).Contains("private-payload-test"), "WebPush signs VAPID and encrypts payloads");
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
    await db.Database.ExecuteSqlRawAsync("DROP TABLE PushDeliveries; DROP TABLE Notifications; DROP TABLE PushDevices;");
    await SqliteNotificationUpgrade.Apply(db); await SqliteNotificationUpgrade.Apply(db);
    Assert(await db.Tasks.IgnoreQueryFilters().AnyAsync(t => t.Id == task.Id) && await db.Notifications.CountAsync() == 0, "SQLite local upgrade is idempotent and preserves existing tasks");
}
Console.WriteLine("Notification delivery checks passed. No external push service was contacted.");

static void Assert(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); }
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
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) {
        Body = await request.Content!.ReadAsByteArrayAsync(ct); Authorization = request.Headers.Contains("Authorization");
        return new HttpResponseMessage(Status) { Content = new StringContent("") };
    }
}
