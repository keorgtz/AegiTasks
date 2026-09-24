using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;
public static class SpaceEndpoints
{
    public static void MapSpaces(this WebApplication app)
    {
        app.MapGet("/api/spaces", async (AppDb db, ClaimsPrincipal user) => {
            var id = user.UserId();
            var spaces = await Access.SpacesFor(db, id).OrderByDescending(s => s.IsPersonal).ThenBy(s => s.Name).Select(s => new { s.Id, s.Name, s.OwnerId, s.IsPersonal }).ToListAsync();
            var pages = new List<string>(); foreach (var page in Access.Pages) if (await Access.Can(db, user, page)) pages.Add(page);
            if (user.IsInRole("Admin")) pages.AddRange(["users", "roles"]);
            return Results.Ok(new { spaces, permissions = pages });
        }).RequireAuthorization();
        var group = app.MapGroup("/api/spaces").RequireAuthorization("page:spaces");
        group.MapPost("/", async (SpaceInput input, AppDb db, ClaimsPrincipal user) => {
            var space = new Space { Name = Rules.Text(input.Name, 80, "Nombre"), OwnerId = user.UserId() };
            db.Spaces.Add(space); Access.AddTags(db, space.Id); await db.SaveChangesAsync();
            return Results.Ok(new { space.Id, space.Name, space.OwnerId, space.IsPersonal });
        });
        group.MapPost("/join", async (JoinInput input, AppDb db, ClaimsPrincipal user) => {
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Rules.Text(input.Code, 100, "Invitación"))));
            var space = await db.Spaces.SingleOrDefaultAsync(s => !s.IsPersonal && s.InviteHash == hash && s.InviteExpiresAt > DateTime.UtcNow);
            if (space == null) throw new InputError("La invitación no es válida o venció.");
            if (space.OwnerId != user.UserId() && !await db.SpaceMembers.AnyAsync(m => m.SpaceId == space.Id && m.UserId == user.UserId())) {
                db.SpaceMembers.Add(new SpaceMember { SpaceId = space.Id, UserId = user.UserId() }); await db.SaveChangesAsync();
            }
            return Results.Ok(new { space.Id, space.Name, space.OwnerId, space.IsPersonal });
        });
        group.MapGet("/{id:guid}/members", async (Guid id, AppDb db, ClaimsPrincipal user) => {
            if (!await Access.SpacesFor(db, user.UserId()).AnyAsync(s => s.Id == id)) return Results.NotFound();
            return Results.Ok(await Access.Members(db, id).Select(u => new { u.Id, u.Name, u.Email, u.Active }).ToListAsync());
        });
        group.MapPut("/{id:guid}", async (Guid id, SpaceInput input, AppDb db, ClaimsPrincipal user) => {
            var space = await db.Spaces.SingleOrDefaultAsync(s => s.Id == id && s.OwnerId == user.UserId());
            if (space == null) return Results.NotFound();
            space.Name = Rules.Text(input.Name, 80, "Nombre"); await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapPost("/{id:guid}/invite", async (Guid id, AppDb db, ClaimsPrincipal user) => {
            var space = await db.Spaces.SingleOrDefaultAsync(s => s.Id == id && s.OwnerId == user.UserId() && !s.IsPersonal);
            if (space == null) return Results.NotFound();
            var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(24));
            space.InviteHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(code))); space.InviteExpiresAt = DateTime.UtcNow.AddDays(7);
            await db.SaveChangesAsync(); return Results.Ok(new { code, expiresAt = space.InviteExpiresAt });
        });
        group.MapDelete("/{id:guid}/invite", async (Guid id, AppDb db, ClaimsPrincipal user) => {
            var space = await db.Spaces.SingleOrDefaultAsync(s => s.Id == id && s.OwnerId == user.UserId());
            if (space == null) return Results.NotFound(); space.InviteHash = null; space.InviteExpiresAt = null; await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{id:guid}/members/{member:guid}", async (Guid id, Guid member, AppDb db, ClaimsPrincipal user) => {
            var space = await Access.SpacesFor(db, user.UserId()).SingleOrDefaultAsync(s => s.Id == id && !s.IsPersonal);
            if (space == null) return Results.NotFound();
            if (member == space.OwnerId) throw new InputError("El propietario conserva su membresía. Transfiere primero la propiedad.");
            if (space.OwnerId != user.UserId() && member != user.UserId()) return Results.Forbid();
            var membership = await db.SpaceMembers.FindAsync(id, member); if (membership == null) return Results.NotFound();
            db.SpaceMembers.Remove(membership); await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapPost("/{id:guid}/owner", async (Guid id, OwnerInput input, AppDb db, ClaimsPrincipal user) => {
            var space = await db.Spaces.SingleOrDefaultAsync(s => s.Id == id && s.OwnerId == user.UserId() && !s.IsPersonal);
            if (space == null) return Results.NotFound();
            if (input.UserId == user.UserId() || !await db.SpaceMembers.AnyAsync(m => m.SpaceId == id && m.UserId == input.UserId) || !await db.Users.AnyAsync(u => u.Id == input.UserId && u.Active)) throw new InputError("Selecciona otro miembro activo.");
            if (!await db.SpaceMembers.AnyAsync(m => m.SpaceId == id && m.UserId == space.OwnerId)) db.SpaceMembers.Add(new SpaceMember { SpaceId = id, UserId = space.OwnerId });
            space.OwnerId = input.UserId; await db.SaveChangesAsync(); return Results.NoContent();
        });
    }
    public record SpaceInput(string Name);
    public record JoinInput(string Code);
    public record OwnerInput(Guid UserId);
}
