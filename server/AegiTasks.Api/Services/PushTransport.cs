using System.Net;
using AegiTasks.Api.Domain;
using WebPush;

namespace AegiTasks.Api.Services;

public interface IPushTransport
{
    Task<bool> Send(PushDevice device, string payload, VapidDetails keys, CancellationToken ct);
}
public sealed class WebPushTransport(HttpClient http) : IPushTransport, IDisposable
{
    private readonly WebPushClient client = new(http);
    public async Task<bool> Send(PushDevice device, string payload, VapidDetails keys, CancellationToken ct)
    {
        try
        {
            await client.SendNotificationAsync(new PushSubscription(device.Endpoint, device.P256dh, device.Auth), payload,
                new Dictionary<string, object> { ["vapidDetails"] = keys, ["TTL"] = 86400 }, ct);
            return true;
        }
        catch (WebPushException e) when (e.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound) { return false; }
    }
    public void Dispose() => client.Dispose();
}
