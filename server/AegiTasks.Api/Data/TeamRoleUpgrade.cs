using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Data;

public static class TeamRoleUpgrade
{
    public static async Task Apply(AppDb db)
    {
        var scripts = db.Database.GenerateCreateScript().Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        // Only fixed schema names from EF-generated DDL are used here.
#pragma warning disable EF1002, EF1003
        foreach (var sql in scripts.Where(s => s.StartsWith("CREATE TABLE \"TeamRoles\"", StringComparison.Ordinal) || s.StartsWith("CREATE TABLE \"TeamRoleAssignments\"", StringComparison.Ordinal)))
            await db.Database.ExecuteSqlRawAsync(sql.Replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", StringComparison.Ordinal) + ";");
        foreach (var sql in scripts.Where(s => s.Contains(" ON \"TeamRoles\" ", StringComparison.Ordinal) || s.Contains(" ON \"TeamRoleAssignments\" ", StringComparison.Ordinal)))
            await db.Database.ExecuteSqlRawAsync(sql.Replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", StringComparison.Ordinal).Replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", StringComparison.Ordinal) + ";");
#pragma warning restore EF1002, EF1003
    }
}
