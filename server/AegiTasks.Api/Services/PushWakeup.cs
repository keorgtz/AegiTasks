using System.Threading.Channels;

namespace AegiTasks.Api.Services;

// Wake only after the transaction commits; the database outbox remains the source of truth.
public sealed class PushWakeup
{
    private readonly Channel<bool> signals = Channel.CreateBounded<bool>(new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true });
    public void Notify() => signals.Writer.TryWrite(true);
    public async Task Wait(CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        try { await signals.Reader.ReadAsync(timeout.Token); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { }
    }
}
