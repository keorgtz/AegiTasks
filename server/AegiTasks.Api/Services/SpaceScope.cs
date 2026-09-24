using System.Security.Claims;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public sealed class SpaceScope
{
    public Guid SpaceId { get; set; }
    public Guid UserId { get; set; }
}
public static class Access
{
    public static readonly string[] Pages = ["tasks", "projects", "notes", "focus", "spaces", "settings"];
    public static async Task<bool> Can(AppDb db, ClaimsPrincipal user, string page)
    {
        if (user.Identity?.IsAuthenticated != true) return false;
        if (user.IsInRole("Admin")) return true;
        var role = user.FindFirstValue(ClaimTypes.Role);
        return await db.PagePermissions.AnyAsync(x => x.RoleName == role && x.Page == page && x.Allowed);
    }
    public static IQueryable<Space> SpacesFor(AppDb db, Guid userId) => db.Spaces.Where(s => s.OwnerId == userId || (!s.IsPersonal && db.SpaceMembers.Any(m => m.SpaceId == s.Id && m.UserId == userId)));
    public static IQueryable<User> Members(AppDb db, Guid spaceId) => db.Users.Where(u => db.Spaces.Any(s => s.Id == spaceId && s.OwnerId == u.Id) || db.SpaceMembers.Any(m => m.SpaceId == spaceId && m.UserId == u.Id));
    public static void AddPersonal(AppDb db, User user)
    {
        var space = new Space { Name = "Personal", OwnerId = user.Id, IsPersonal = true };
        db.Spaces.Add(space); AddTags(db, space.Id);
    }
    public static void AddTags(AppDb db, Guid id) => db.Tags.AddRange(new Tag { SpaceId = id, Name = "BUG", Color = "red" }, new Tag { SpaceId = id, Name = "ADD", Color = "green" }, new Tag { SpaceId = id, Name = "FIX", Color = "blue" });
}
