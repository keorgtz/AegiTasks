using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

var checks = 0;
void Assert(bool condition, string name) { if (!condition) throw new Exception(name); checks++; Console.WriteLine("PASS " + name); }
await using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
var options = new DbContextOptionsBuilder<AppDb>().UseSqlite(connection).Options;
await using var db = new AppDb(options, new SpaceScope());
await db.Database.EnsureCreatedAsync();
db.Roles.Add(new AppRole { Name = "User" });
var owner = new User { Name = "Owner", Username = "owner", Email = "owner@example.test", Role = "User", PasswordHash = "test-only" };
db.Users.Add(owner);
var space = new Space { Name = "Existing workspace", OwnerId = owner.Id };
db.Spaces.Add(space);
db.SpaceMembers.Add(new SpaceMember { SpaceId = space.Id, UserId = owner.Id });
await db.SaveChangesAsync();
// Reconstruct only this isolated in-memory fixture's pre-team-role schema.
await db.Database.ExecuteSqlRawAsync("DROP TABLE TeamRoleAssignments; DROP TABLE TeamRoles;");
await TeamRoleUpgrade.Apply(db); await TeamRoleUpgrade.Apply(db);
Assert(await db.SpaceMembers.CountAsync() == 1, "SQLite upgrade retains existing workspace membership idempotently");
Assert(await db.TeamRoles.CountAsync() == 0 && await db.TeamRoleAssignments.CountAsync() == 0, "Upgrade starts with no invented team roles or assignments");
var role = new TeamRole { SpaceId = space.Id, Name = "Dirección técnica", NormalizedName = "DIRECCIÓN TÉCNICA" };
db.TeamRoles.Add(role);
var assignment = new TeamRoleAssignment { SpaceId = space.Id, UserId = owner.Id, TeamRoleId = role.Id };
db.TeamRoleAssignments.Add(assignment); await db.SaveChangesAsync();
await TeamRoleUpgrade.Apply(db);
Assert(await db.TeamRoleAssignments.CountAsync() == 1, "Repeated startup upgrade preserves existing assigned roles");
await using (var other = new AppDb(options, new SpaceScope())) {
    var updated = await other.TeamRoles.SingleAsync(); updated.Name = "Dirección de operaciones"; updated.Version = Guid.NewGuid(); await other.SaveChangesAsync();
}
role.Name = "Stale edit"; role.Version = Guid.NewGuid();
try { await db.SaveChangesAsync(); Assert(false, "Stale catalog edit must fail"); }
catch (DbUpdateConcurrencyException) { Assert(true, "Database rejects stale role catalog updates"); }
db.ChangeTracker.Clear();
await using (var other = new AppDb(options, new SpaceScope())) {
    var updated = await other.TeamRoleAssignments.SingleAsync(); updated.Version = Guid.NewGuid(); await other.SaveChangesAsync();
}
// Use an older assignment version to verify optimistic concurrency at the persistence layer.
db.Attach(assignment); assignment.Version = Guid.NewGuid();
try { await db.SaveChangesAsync(); Assert(false, "Stale assignment edit must fail"); }
catch (DbUpdateConcurrencyException) { Assert(true, "Database rejects stale team role assignments"); }
db.ChangeTracker.Clear();
var otherSpace = new Space { Name = "Another workspace", OwnerId = owner.Id };
db.Spaces.Add(otherSpace); db.SpaceMembers.Add(new SpaceMember { SpaceId = otherSpace.Id, UserId = owner.Id }); await db.SaveChangesAsync();
db.TeamRoleAssignments.Add(new TeamRoleAssignment { SpaceId = otherSpace.Id, UserId = owner.Id, TeamRoleId = role.Id });
try { await db.SaveChangesAsync(); Assert(false, "Cross-workspace assignment must fail"); }
catch (DbUpdateException) { Assert(true, "Composite foreign key rejects cross-workspace assignments"); }
db.ChangeTracker.Clear();
await db.TeamRoles.ExecuteDeleteAsync();
Assert(await db.TeamRoleAssignments.CountAsync() == 0, "Deleting a role clears its member assignments");
Assert(await db.SpaceMembers.CountAsync() == 2 && await db.Users.CountAsync() == 1, "Deleting a role preserves memberships and users");
role = new TeamRole { SpaceId = space.Id, Name = "Soporte", NormalizedName = "SOPORTE" };
db.TeamRoles.Add(role); db.TeamRoleAssignments.Add(new TeamRoleAssignment { SpaceId = space.Id, UserId = owner.Id, TeamRoleId = role.Id }); await db.SaveChangesAsync();
await db.SpaceMembers.Where(m => m.SpaceId == space.Id).ExecuteDeleteAsync();
Assert(await db.TeamRoleAssignments.CountAsync() == 0 && await db.TeamRoles.CountAsync() == 1, "Leaving a workspace clears job assignments without deleting its catalog");
await using var command = connection.CreateCommand(); command.CommandText = "PRAGMA foreign_key_check";
await using var reader = await command.ExecuteReaderAsync(); Assert(!await reader.ReadAsync(), "SQLite upgrade and cascading deletes preserve foreign key integrity");
Console.WriteLine($"{checks} team-role persistence checks passed.");
