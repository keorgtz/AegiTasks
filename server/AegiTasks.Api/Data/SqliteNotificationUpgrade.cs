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
        var connection = db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await db.Database.OpenConnectionAsync();
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA table_info('Notifications');";
            var hasTitle = false;
            await using (var reader = await command.ExecuteReaderAsync())
                while (await reader.ReadAsync()) hasTitle |= reader.GetString(1) == "TaskTitle";
            if (!hasTitle) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Notifications ADD COLUMN TaskTitle TEXT NOT NULL DEFAULT ''; ");
            await db.Database.ExecuteSqlRawAsync("UPDATE Notifications SET TaskTitle = COALESCE((SELECT Title FROM Tasks WHERE Tasks.Id = Notifications.WorkItemId), '') WHERE TaskTitle = ''; ");
        }
        finally
        {
            if (opened) await db.Database.CloseConnectionAsync();
        }
    }
#pragma warning restore EF1003
}
