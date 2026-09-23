using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
namespace AegiTasks.Api.Data;

public static class Bootstrap
{
    public static async Task Seed(AppDb db, IPasswordHasher<User> hasher, IConfiguration config)
    {
        if (await db.Users.AnyAsync()) return;
        var password = config["SEED_ADMIN_PASSWORD"] ?? throw new InvalidOperationException("Set SEED_ADMIN_PASSWORD (12+ characters) before the first start.");
        Rules.Password(password);
        var user = new User { Name = "Administrador", Email = (config["SEED_ADMIN_EMAIL"] ?? "admin@example.com").Trim().ToLowerInvariant(), Role = "Admin" };
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);
        db.Tags.AddRange(new Tag { Name = "BUG", Color = "red" }, new Tag { Name = "ADD", Color = "green" }, new Tag { Name = "FIX", Color = "blue" });
        await db.SaveChangesAsync();
    }
}
