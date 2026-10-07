using Microsoft.EntityFrameworkCore;
using AegiTasks.Api.Domain;

namespace AegiTasks.Api.Data;

public static class ChatUpgrade
{
    public static async Task Apply(AppDb db)
    {
        var tables = new[] { "ChatRooms", "ChatMembers", "ChatMessages", "ChatFiles", "ChatNotificationPreferences", "ChatAlerts", "ChatPushDeliveries" };
#pragma warning disable EF1003
        foreach (var sql in db.Database.GenerateCreateScript().Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (tables.Any(t => sql.StartsWith($"CREATE TABLE \"{t}\"", StringComparison.Ordinal)))
                await db.Database.ExecuteSqlRawAsync(sql.Replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", StringComparison.Ordinal) + ";");
            else if (tables.Any(t => sql.Contains($" ON \"{t}\" ", StringComparison.Ordinal)))
                await db.Database.ExecuteSqlRawAsync(sql.Replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", StringComparison.Ordinal).Replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", StringComparison.Ordinal) + ";");
        }
#pragma warning restore EF1003
        foreach (var role in await db.Roles.Select(r => r.Name).ToListAsync())
            if (!await db.PagePermissions.AnyAsync(p => p.RoleName == role && p.Page == "chat")) db.PagePermissions.Add(new PagePermission { RoleName = role, Page = "chat" });
        await db.SaveChangesAsync();
    }
}
