using System.Security.Claims;
using System.Net.Mail;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuth(this WebApplication app)
    {
        app.MapPost("/api/auth/login", async (LoginInput input, AppDb db, IPasswordHasher<User> hash, HttpContext context) =>
        {
            var email = Rules.Text(input.Email, 200, "Correo").ToLowerInvariant();
            var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email && x.Active);
            if (user == null || string.IsNullOrEmpty(input.Password) || input.Password.Length > 128 || hash.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
                return Results.Json(new { error = "Correo o contraseña incorrectos." }, statusCode: 401);
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Role, user.Role), new Claim("sv", user.SessionVersion.ToString()) }, CookieAuthenticationDefaults.AuthenticationScheme);
            await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
            return Results.Ok(Rules.PublicUser(user));
        }).RequireRateLimiting("login");
        app.MapPost("/api/auth/logout", async (HttpContext c) => { await c.SignOutAsync(); return Results.NoContent(); });
        app.MapGet("/api/auth/me", async (AppDb db, ClaimsPrincipal principal) => Rules.PublicUser(await db.Users.SingleAsync(x => x.Id == principal.UserId()))).RequireAuthorization();
        app.MapPost("/api/auth/password", async (PasswordInput input, AppDb db, IPasswordHasher<User> hash, ClaimsPrincipal principal, HttpContext context) =>
        {
            var user = await db.Users.SingleAsync(x => x.Id == principal.UserId());
            if (string.IsNullOrEmpty(input.CurrentPassword) || input.CurrentPassword.Length > 128 || hash.VerifyHashedPassword(user, user.PasswordHash, input.CurrentPassword) == PasswordVerificationResult.Failed) throw new InputError("La contraseña actual no coincide.");
            Rules.Password(input.NewPassword); user.PasswordHash = hash.HashPassword(user, input.NewPassword); user.SessionVersion++;
            await db.SaveChangesAsync(); await context.SignOutAsync(); return Results.NoContent();
        }).RequireAuthorization();
        var admin = app.MapGroup("/api/users").RequireAuthorization("Admin");
        admin.MapPost("/", async (UserInput input, AppDb db, IPasswordHasher<User> hash) =>
        {
            var email = Rules.Text(input.Email, 200, "Correo").ToLowerInvariant();
            if (!MailAddress.TryCreate(email, out var parsed) || parsed.Address != email) throw new InputError("Correo no válido.");
            Rules.Password(input.Password ?? "");
            if (!await db.Roles.AnyAsync(r => r.Name == input.Role)) throw new InputError("Rol no válido.");
            var user = new User { Email = email, Name = Rules.Text(input.Name, 80, "Nombre"), Role = input.Role };
            user.PasswordHash = hash.HashPassword(user, input.Password!); db.Users.Add(user); Access.AddPersonal(db, user); await db.SaveChangesAsync(); return Results.Ok(Rules.PublicUser(user));
        });
        admin.MapPut("/{id:guid}", async (Guid id, UserUpdate input, AppDb db, IPasswordHasher<User> hash, ClaimsPrincipal principal) =>
        {
            var user = await db.Users.FindAsync(id); if (user == null) return Results.NotFound();
            if (id == principal.UserId() && (!input.Active || input.Role != "Admin")) throw new InputError("No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.");
            if (!await db.Roles.AnyAsync(r => r.Name == input.Role)) throw new InputError("Rol no válido.");
            user.Name = Rules.Text(input.Name, 80, "Nombre"); user.Active = input.Active; user.Role = input.Role; user.SessionVersion++;
            if (!string.IsNullOrWhiteSpace(input.Password)) { Rules.Password(input.Password); user.PasswordHash = hash.HashPassword(user, input.Password); }
            await db.SaveChangesAsync(); return Results.Ok(Rules.PublicUser(user));
        });
    }
    public record LoginInput(string Email, string Password);
    public record PasswordInput(string CurrentPassword, string NewPassword);
    public record UserInput(string Email, string Name, string Role, string? Password);
    public record UserUpdate(string Name, string Role, bool Active, string? Password);
}
