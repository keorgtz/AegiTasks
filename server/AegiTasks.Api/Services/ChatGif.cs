using System.Text.RegularExpressions;

namespace AegiTasks.Api.Services;

public static partial class ChatGif
{
    private static readonly HashSet<string> Hosts = new(StringComparer.OrdinalIgnoreCase) {
        "static.klipy.com", "static1.klipy.com", "static2.klipy.com", "media.tenor.com", "media1.tenor.com", "c.tenor.com",
        "media.giphy.com", "media0.giphy.com", "media1.giphy.com", "media2.giphy.com", "media3.giphy.com", "media4.giphy.com", "i.giphy.com"
    };
    [GeneratedRegex("https://[^\\s<>\"']+")]
    private static partial Regex Links();
    [GeneratedRegex("!\\[Sticker KLIPY\\]\\(<(https://[^\\s<>\"']+)>\\)")]
    private static partial Regex Stickers();
    public static string Preview(string body) => Links().Replace(Stickers().Replace(body, match =>
        Uri.TryCreate(match.Groups[1].Value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.UserInfo == "" && uri.IsDefaultPort && uri.Fragment == "" &&
        (uri.Host.Equals("static.klipy.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("static1.klipy.com", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("static2.klipy.com", StringComparison.OrdinalIgnoreCase)) &&
        (uri.AbsolutePath.EndsWith(".gif", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath.EndsWith(".webp", StringComparison.OrdinalIgnoreCase) || uri.AbsolutePath.EndsWith(".png", StringComparison.OrdinalIgnoreCase))
            ? "Sticker compartido" : match.Value), match =>
        Uri.TryCreate(match.Value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.UserInfo == "" && uri.IsDefaultPort && uri.Fragment == "" && Hosts.Contains(uri.Host) && uri.AbsolutePath.EndsWith(".gif", StringComparison.OrdinalIgnoreCase)
            ? "GIF compartido" : match.Value);
}
