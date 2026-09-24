using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text.Json;
using System.Threading.Channels;
using AegiTasks.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

// One API instance serves the Docker deployment. Events contain invalidation topics, never content.
public sealed class ChangeFeed
{
    private readonly ConcurrentDictionary<Guid, Subscription> subscribers = new();
    public sealed class Subscription(Guid userId, Guid spaceId)
    {
        public Guid UserId { get; } = userId;
        public Guid SpaceId { get; } = spaceId;
        public Channel<bool> Signal { get; } = Channel.CreateBounded<bool>(1);
        private readonly HashSet<string> pending = [];
        public void Add(string[] topics) { lock (pending) { pending.UnionWith(topics); Signal.Writer.TryWrite(true); } }
        public string[] Drain() { lock (pending) { var topics = pending.ToArray(); pending.Clear(); return topics; } }
    }
    public void Publish(Guid? spaceId, Guid? userId, params string[] topics)
    {
        foreach (var s in subscribers.Values)
            if ((spaceId == null || s.SpaceId == spaceId) && (userId == null || s.UserId == userId)) s.Add(topics);
    }
    public async Task Stream(HttpContext http, Guid space, IServiceScopeFactory scopes)
    {
        var ct = http.RequestAborted;
        var userId = http.User.UserId();
        var subscription = new Subscription(userId, space);
        var key = Guid.NewGuid();
        // Register before validation so membership revocations cannot race subscription setup.
        subscribers[key] = subscription;
        try
        {
            async Task<int> Validate()
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDb>();
                var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct);
                if (user == null || !user.Active || http.User.FindFirstValue("sv") != user.SessionVersion.ToString()) return 401;
                return await Access.SpacesFor(db, userId).AnyAsync(s => s.Id == space, ct) ? 200 : 403;
            }
            var access = await Validate();
            if (access != 200) { http.Response.StatusCode = access; return; }
            http.Response.ContentType = "text/event-stream";
            http.Response.Headers["Cache-Control"] = "no-cache, no-store";
            http.Response.Headers["X-Accel-Buffering"] = "no";
            await http.Response.WriteAsync("retry: 3000\nevent: ready\ndata: {}\n\n", ct);
            await http.Response.Body.FlushAsync(ct);
            var pendingRead = subscription.Signal.Reader.WaitToReadAsync(ct).AsTask();
            while (!ct.IsCancellationRequested)
            {
                using var delayCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                var heartbeat = Task.Delay(TimeSpan.FromSeconds(20), delayCts.Token);
                if (await Task.WhenAny(pendingRead, heartbeat) == pendingRead)
                {
                    await delayCts.CancelAsync();
                    if (!await pendingRead) break;
                    subscription.Signal.Reader.TryRead(out _);
                    var topics = subscription.Drain();
                    access = await Validate();
                    if (access != 200)
                    {
                        await http.Response.WriteAsync($"event: revoked\ndata: {access}\n\n", ct);
                        await http.Response.Body.FlushAsync(ct);
                        break;
                    }
                    await http.Response.WriteAsync($"event: change\ndata: {JsonSerializer.Serialize(topics)}\n\n", ct);
                    pendingRead = subscription.Signal.Reader.WaitToReadAsync(ct).AsTask();
                }
                else await http.Response.WriteAsync(": keepalive\n\n", ct);
                await http.Response.Body.FlushAsync(ct);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        finally { subscribers.TryRemove(key, out _); }
    }
}
