using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using WebPush;

namespace AegiTasks.Api.Services;

public sealed class PushKeys(IConfiguration config, IDataProtectionProvider protection)
{
    private VapidDetails? details;
    public VapidDetails Details => details ?? throw new InvalidOperationException("Push keys have not been initialized.");
    public void Initialize()
    {
        var directory = Path.GetFullPath(config["DataProtectionPath"] ?? Path.Combine(config["StoragePath"] ?? "uploads", "..", "keys"));
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "webpush-vapid.json");
        var protector = protection.CreateProtector("AegiTasks.WebPush.Keys.v1");
        if (!File.Exists(path))
        {
            var generated = VapidHelper.GenerateVapidKeys();
            using var file = new StreamWriter(new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None));
            file.Write(protector.Protect(JsonSerializer.Serialize(new StoredKeys(generated.PublicKey, generated.PrivateKey))));
        }
        var keys = JsonSerializer.Deserialize<StoredKeys>(protector.Unprotect(File.ReadAllText(path)))!;
        var subject = config["Notifications:Subject"] ?? "mailto:" + (config["SEED_ADMIN_EMAIL"] ?? "admin@example.com");
        details = new VapidDetails(subject, keys.PublicKey, keys.PrivateKey);
    }
    private sealed record StoredKeys(string PublicKey, string PrivateKey);
}
