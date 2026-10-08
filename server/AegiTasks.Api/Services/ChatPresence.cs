namespace AegiTasks.Api.Services;

// Ephemeral leases belong to validated SSE connections, never client-supplied user identities.
public sealed class ChatPresence(TimeProvider clock)
{
    private sealed record Session(Guid UserId, bool Active, DateTimeOffset Seen);
    private readonly object gate = new();
    private readonly Dictionary<Guid, Session> sessions = [];
    private readonly Dictionary<Guid, string> published = [];
    public static readonly TimeSpan Lease = TimeSpan.FromSeconds(90);

    private string Status(Guid userId, DateTimeOffset now)
    {
        var live = sessions.Values.Where(s => s.UserId == userId && now - s.Seen < Lease).ToArray();
        return live.Any(s => s.Active) ? "online" : live.Length > 0 ? "away" : "offline";
    }
    private bool Changed()
    {
        var now = clock.GetUtcNow();
        var changed = false;
        foreach (var userId in sessions.Values.Select(s => s.UserId).Concat(published.Keys).Distinct().ToArray())
        {
            var status = Status(userId, now);
            if (status != published.GetValueOrDefault(userId, "offline")) changed = true;
            if (status == "offline") published.Remove(userId); else published[userId] = status;
        }
        return changed;
    }
    public bool Connect(Guid connectionId, Guid userId)
    {
        lock (gate) { sessions[connectionId] = new(userId, false, clock.GetUtcNow()); return Changed(); }
    }
    public (bool Accepted, bool Changed) Update(Guid connectionId, Guid userId, bool active)
    {
        lock (gate)
        {
            if (!sessions.TryGetValue(connectionId, out var session) || session.UserId != userId) return (false, false);
            sessions[connectionId] = new(userId, active, clock.GetUtcNow());
            return (true, Changed());
        }
    }
    public bool Disconnect(Guid connectionId)
    {
        lock (gate) { sessions.Remove(connectionId); return Changed(); }
    }
    public bool Sweep() { lock (gate) return Changed(); }
    public Dictionary<Guid, string> Snapshot(IEnumerable<Guid> userIds)
    {
        lock (gate)
        {
            var now = clock.GetUtcNow();
            return userIds.Distinct().ToDictionary(id => id, id => Status(id, now));
        }
    }
}
