using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Data;

public static class SqliteNotificationUpgrade
{
#pragma warning disable EF1003 // SQL is generated exclusively from the EF model, never request input.
    public static async Task Apply(AppDb db)
    {
        // Generate from the current SQLite model so local upgrades and new databases agree.
        var sql = db.Database.GenerateCreateScript();
        var tables = new[] { "Notifications", "PushDevices", "PushDeliveries" };
        foreach (var statement in sql.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (tables.Any(t => statement.StartsWith($"CREATE TABLE \"{t}\"", StringComparison.Ordinal)))
                await db.Database.ExecuteSqlRawAsync(statement.Replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", StringComparison.Ordinal) + ";");
            else if (tables.Any(t => statement.Contains($" ON \"{t}\" ", StringComparison.Ordinal)))
                await db.Database.ExecuteSqlRawAsync(statement.Replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", StringComparison.Ordinal).Replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", StringComparison.Ordinal) + ";");
        }
    }
#pragma warning restore EF1003
}
