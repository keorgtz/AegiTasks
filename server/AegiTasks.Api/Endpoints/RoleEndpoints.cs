using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;
public static class RoleEndpoints
{
    public static void MapRoles(this WebApplication app)
    {
        app.MapGet("/api/users", async (AppDb db) => await db.Users.OrderBy(u => u.Name).Select(u => new { u.Id, u.Name, u.Email, u.Role, u.Active }).ToListAsync()).RequireAuthorization("Admin");
        var group = app.MapGroup("/api/roles").RequireAuthorization("Admin");
        group.MapGet("/", async (AppDb db) => Results.Ok(new { pages = Access.Pages, roles = await db.Roles.OrderBy(r => r.Name).ToListAsync(), permissions = await db.PagePermissions.ToListAsync() }));
        group.MapPost("/", async (RoleInput input, AppDb db) => {
            var name = Rules.Text(input.Name, 40, "Rol");
            if (name.Equals("Admin", StringComparison.OrdinalIgnoreCase) || name.Equals("User", StringComparison.OrdinalIgnoreCase)) throw new InputError("Ese rol del sistema ya existe.");
            db.Roles.Add(new AppRole { Name = name });
            foreach (var page in Access.Pages) db.PagePermissions.Add(new PagePermission { RoleName = name, Page = page });
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapPut("/{name}/permissions", async (string name, PermissionsInput input, AppDb db) => {
            if (name == "Admin") throw new InputError("El administrador conserva acceso a todas las páginas.");
            if (!await db.Roles.AnyAsync(r => r.Name == name)) return Results.NotFound();
            if (input.Pages == null || input.Pages.Any(p => !Access.Pages.Contains(p))) throw new InputError("Página no válida. Usuarios y roles son exclusivos de Admin.");
            foreach (var p in await db.PagePermissions.Where(p => p.RoleName == name).ToListAsync()) p.Allowed = input.Pages.Contains(p.Page);
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapDelete("/{name}", async (string name, AppDb db) => {
            var role = await db.Roles.FindAsync(name); if (role == null) return Results.NotFound();
            if (role.IsSystem || await db.Users.AnyAsync(u => u.Role == name)) throw new InputError("No se puede eliminar un rol del sistema o asignado a usuarios.");
            db.Roles.Remove(role); await db.SaveChangesAsync(); return Results.NoContent();
        });
    }
    public record RoleInput(string Name);
    public record PermissionsInput(string[] Pages);
}
