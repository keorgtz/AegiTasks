using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Data;

// The local SQLite profile uses EnsureCreated, so extend existing files explicitly.
public static class SqlitePlanningUpgrade
{
    // Identifiers below come only from the fixed table/column lists in this method.
#pragma warning disable EF1002
    public static async Task Apply(AppDb db)
    {
        async Task<HashSet<string>> Columns(string table) {
            await using var command = db.Database.GetDbConnection().CreateCommand();
            command.CommandText = $"PRAGMA table_info('{table}')";
            var result = new HashSet<string>();
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync()) result.Add(reader.GetString(1));
            return result;
        }
        var projects = await Columns("Projects");
        if (!projects.Contains("EstimateScheme")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE Projects ADD COLUMN EstimateScheme TEXT NOT NULL DEFAULT 'time'");
        foreach (var table in new[] { "Modules", "Cycles" }) {
            await db.Database.ExecuteSqlRawAsync($"""
                CREATE TABLE IF NOT EXISTS "{table}" (
                  "Id" TEXT NOT NULL PRIMARY KEY, "ProjectId" TEXT NOT NULL,
                  "Name" TEXT NOT NULL, "Description" TEXT NOT NULL, "Color" TEXT NOT NULL,
                  "StartsOn" TEXT NULL, "EndsOn" TEXT NULL,
                  UNIQUE ("Id", "ProjectId"), FOREIGN KEY ("ProjectId") REFERENCES "Projects" ("Id") ON DELETE RESTRICT
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_{table}_ProjectId_Name" ON "{table}" ("ProjectId", "Name");
                """);
        }
        var tasks = await Columns("Tasks");
        var additions = new Dictionary<string, string> {
            ["ModuleId"] = "TEXT NULL", ["CycleId"] = "TEXT NULL", ["EstimateKind"] = "TEXT NOT NULL DEFAULT 'time'",
            ["EstimatePoints"] = "INTEGER NULL", ["EstimateCategory"] = "TEXT NULL"
        };
        foreach (var (name, definition) in additions)
            if (!tasks.Contains(name)) await db.Database.ExecuteSqlRawAsync($"ALTER TABLE Tasks ADD COLUMN {name} {definition}");
        await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS IX_Tasks_ModuleId_ProjectId ON Tasks (ModuleId, ProjectId); CREATE INDEX IF NOT EXISTS IX_Tasks_CycleId_ProjectId ON Tasks (CycleId, ProjectId)");
    }
#pragma warning restore EF1002
}
