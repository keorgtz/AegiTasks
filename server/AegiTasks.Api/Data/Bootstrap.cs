using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
namespace AegiTasks.Api.Data;

public static class Bootstrap
{
    public static async Task Seed(AppDb db, IPasswordHasher<User> hasher, IConfiguration config)
    {
        foreach (var name in new[] { "Admin", "User" }) {
            if (!await db.Roles.AnyAsync(r => r.Name == name)) db.Roles.Add(new AppRole { Name = name, IsSystem = true });
            foreach (var page in Access.Pages) if (!await db.PagePermissions.AnyAsync(p => p.RoleName == name && p.Page == page)) db.PagePermissions.Add(new PagePermission { RoleName = name, Page = page });
        }
        await db.SaveChangesAsync();
        var existing = await db.Users.ToListAsync();
        if (existing.Count > 0) {
            foreach (var u in existing) if (!await db.Spaces.AnyAsync(s => s.IsPersonal && s.OwnerId == u.Id)) Access.AddPersonal(db, u);
            await db.SaveChangesAsync(); return;
        }
        var password = config["SEED_ADMIN_PASSWORD"] ?? throw new InvalidOperationException("Set SEED_ADMIN_PASSWORD (12+ characters) before the first start.");
        Rules.Password(password);
        var user = new User { Name = "Administrador", Email = (config["SEED_ADMIN_EMAIL"] ?? "admin@example.com").Trim().ToLowerInvariant(), Role = "Admin" };
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);
        Access.AddPersonal(db, user);
        await db.SaveChangesAsync();
    }
}
