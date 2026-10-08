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
        foreach (var role in await db.Roles.Select(r => r.Name).ToListAsync())
            if (!await db.PagePermissions.AnyAsync(p => p.RoleName == role && p.Page == "reminders")) db.PagePermissions.Add(new PagePermission { RoleName = role, Page = "reminders" });
        await db.SaveChangesAsync();
        var existing = await db.Users.OrderBy(u => u.Email).ToListAsync();
        var usernames = existing.Where(u => !string.IsNullOrEmpty(u.Username)).Select(u => u.Username).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var u in existing) if (string.IsNullOrEmpty(u.Username)) u.Username = Rules.DefaultUsername(u.Email, usernames);
        if (existing.Count > 0) {
            foreach (var u in existing) if (!await db.Spaces.AnyAsync(s => s.IsPersonal && s.OwnerId == u.Id)) Access.AddPersonal(db, u);
            await db.SaveChangesAsync(); return;
        }
        var password = config["SEED_ADMIN_PASSWORD"] ?? throw new InvalidOperationException("Set SEED_ADMIN_PASSWORD before the first start (an empty value is allowed).");
        Rules.Password(password);
        var user = new User { Name = "Administrador", Email = (config["SEED_ADMIN_EMAIL"] ?? "admin@example.com").Trim().ToLowerInvariant(), Role = "Admin" };
        user.Username = Rules.DefaultUsername(user.Email, usernames);
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);
        Access.AddPersonal(db, user);
        await db.SaveChangesAsync();
    }
}
