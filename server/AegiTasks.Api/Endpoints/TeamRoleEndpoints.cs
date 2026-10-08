using System.Security.Claims;
using System.Text;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class TeamRoleEndpoints
{
    public static void MapTeamRoles(this WebApplication app)
    {
        var group = app.MapGroup("/api/spaces/{spaceId:guid}").RequireAuthorization("page:spaces");
        group.MapGet("/team-roles", async (Guid spaceId, AppDb db, ClaimsPrincipal user) => {
            if (await FindSpace(db, user, spaceId) is null) return Results.NotFound();
            return Results.Ok(await db.TeamRoles.Where(r => r.SpaceId == spaceId).OrderBy(r => r.Name)
                .Select(r => new { r.Id, r.Name, r.Description, r.Version }).ToListAsync());
        });
        group.MapPost("/team-roles", async (Guid spaceId, TeamRoleInput input, AppDb db, ClaimsPrincipal user) => {
            var space = await FindSpace(db, user, spaceId);
            if (space is null) return Results.NotFound();
            if (!CanManage(space, user)) return Results.Forbid();
            var role = new TeamRole { SpaceId = spaceId };
            Apply(role, input);
            db.TeamRoles.Add(role);
            await db.SaveChangesAsync();
            return Results.Ok(new { role.Id, role.Name, role.Description, role.Version });
        });
        group.MapPut("/team-roles/{roleId:guid}", async (Guid spaceId, Guid roleId, TeamRoleInput input, AppDb db, ClaimsPrincipal user) => {
            var space = await FindSpace(db, user, spaceId);
            if (space is null) return Results.NotFound();
            if (!CanManage(space, user)) return Results.Forbid();
            var role = await db.TeamRoles.SingleOrDefaultAsync(r => r.SpaceId == spaceId && r.Id == roleId);
            if (role is null) return Results.NotFound();
            if (role.Version != input.Version) return Conflict();
            Apply(role, input); role.Version = Guid.NewGuid();
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
        group.MapDelete("/team-roles/{roleId:guid}", async (Guid spaceId, Guid roleId, Guid version, AppDb db, ClaimsPrincipal user) => {
            var space = await FindSpace(db, user, spaceId);
            if (space is null) return Results.NotFound();
            if (!CanManage(space, user)) return Results.Forbid();
            var role = await db.TeamRoles.SingleOrDefaultAsync(r => r.SpaceId == spaceId && r.Id == roleId);
            if (role is null) return Results.NotFound();
            if (role.Version != version) return Conflict();
            // Cascading assignments removes the job label, never the workspace membership.
            db.TeamRoles.Remove(role); await db.SaveChangesAsync();
            return Results.NoContent();
        });
        group.MapPut("/members/{memberId:guid}/team-role", async (Guid spaceId, Guid memberId, TeamRoleAssignmentInput input, AppDb db, ClaimsPrincipal user) => {
            var space = await FindSpace(db, user, spaceId);
            if (space is null) return Results.NotFound();
            if (!CanManage(space, user)) return Results.Forbid();
            if (!await Access.Members(db, spaceId).AnyAsync(u => u.Id == memberId)) return Results.NotFound();
            if (input.TeamRoleId is Guid roleId && !await db.TeamRoles.AnyAsync(r => r.Id == roleId && r.SpaceId == spaceId))
                throw new InputError("Selecciona un rol de equipo de este workspace.");
            await using var transaction = await db.Database.BeginTransactionAsync();
            var assignment = await db.TeamRoleAssignments.FindAsync(spaceId, memberId);
            if (assignment?.Version != input.Version) return Conflict();
            if (input.TeamRoleId is Guid nextRoleId) {
                // Owners have implicit membership until an assignment needs a durable membership key.
                if (!await db.SpaceMembers.AnyAsync(m => m.SpaceId == spaceId && m.UserId == memberId)) {
                    // Never recreate a removed member after a concurrent removal or ownership transfer.
                    if (!await db.Spaces.AnyAsync(s => s.Id == spaceId && s.OwnerId == memberId && !s.IsPersonal)) return Results.NotFound();
                    db.SpaceMembers.Add(new SpaceMember { SpaceId = spaceId, UserId = memberId });
                }
                if (assignment is null) db.TeamRoleAssignments.Add(new TeamRoleAssignment { SpaceId = spaceId, UserId = memberId, TeamRoleId = nextRoleId });
                else { assignment.TeamRoleId = nextRoleId; assignment.Version = Guid.NewGuid(); }
            } else if (assignment is not null) db.TeamRoleAssignments.Remove(assignment);
            await db.SaveChangesAsync(); await transaction.CommitAsync();
            return Results.NoContent();
        });
    }

    private static Task<Space?> FindSpace(AppDb db, ClaimsPrincipal user, Guid id) =>
        Access.SpacesFor(db, user.UserId()).SingleOrDefaultAsync(s => s.Id == id && !s.IsPersonal);
    private static bool CanManage(Space space, ClaimsPrincipal user) => space.OwnerId == user.UserId() || user.IsInRole("Admin");
    private static IResult Conflict() => Results.Conflict(new { error = "El rol de equipo cambió. Actualiza la vista antes de guardar." });
    private static void Apply(TeamRole role, TeamRoleInput input)
    {
        role.Name = string.Join(" ", Rules.Text(input.Name, 80, "Nombre del rol").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        role.NormalizedName = Rules.Text(role.Name.Normalize(NormalizationForm.FormKC).ToUpperInvariant(), 160, "Nombre del rol");
        role.Description = Rules.Text(input.Description, 400, "Descripción", false);
    }
    public record TeamRoleInput(string Name, string? Description, Guid? Version);
    public record TeamRoleAssignmentInput(Guid? TeamRoleId, Guid? Version);
}
