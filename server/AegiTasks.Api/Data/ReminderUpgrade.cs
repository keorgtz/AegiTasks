using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Data;

public static class ReminderUpgrade
{
    public static async Task Apply(AppDb db)
    {
        var scripts = db.Database.GenerateCreateScript().Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        // Identifiers come only from local schema metadata and EF-generated DDL, never request input.
#pragma warning disable EF1002, EF1003
        foreach (var sql in scripts.Where(s => s.StartsWith("CREATE TABLE \"Reminders\"", StringComparison.Ordinal)))
            await db.Database.ExecuteSqlRawAsync(sql.Replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", StringComparison.Ordinal) + ";");
        await using var cmd = db.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = "PRAGMA table_info('Notifications')";
        var columns = new List<string>(); var upgrade = false;
        await using (var reader = await cmd.ExecuteReaderAsync()) while (await reader.ReadAsync()) {
            var name = reader.GetString(1); columns.Add(name);
            if (name == "WorkItemId" && reader.GetInt32(3) == 1) upgrade = true;
        }
        upgrade |= !columns.Contains("ReminderId");
        if (upgrade) {
            await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys=OFF");
            try {
                await using var transaction = await db.Database.BeginTransactionAsync();
                var create = scripts.Single(s => s.StartsWith("CREATE TABLE \"Notifications\"", StringComparison.Ordinal));
                await db.Database.ExecuteSqlRawAsync(create.Replace("CREATE TABLE \"Notifications\"", "CREATE TABLE \"Notifications_Upgrade\"", StringComparison.Ordinal) + ";");
                var names = string.Join(",", columns.Select(c => "\"" + c.Replace("\"", "\"\"") + "\""));
                await db.Database.ExecuteSqlRawAsync($"INSERT INTO Notifications_Upgrade ({names}) SELECT {names} FROM Notifications");
                await db.Database.ExecuteSqlRawAsync("DROP TABLE Notifications");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Notifications_Upgrade RENAME TO Notifications");
                await transaction.CommitAsync();
            } finally { await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys=ON"); }
        }
        foreach (var sql in scripts.Where(s => s.Contains(" ON \"Reminders\" ", StringComparison.Ordinal) || s.Contains(" ON \"Notifications\" ", StringComparison.Ordinal)))
            await db.Database.ExecuteSqlRawAsync(sql.Replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", StringComparison.Ordinal).Replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", StringComparison.Ordinal) + ";");
#pragma warning restore EF1002, EF1003
    }
}
