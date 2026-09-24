using AegiTasks.Api.Data;
using System.Security.Claims;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;
using TaskStatus = AegiTasks.Api.Domain.TaskStatus;

namespace AegiTasks.Api.Endpoints;

public static class CatalogEndpoints
{
    public static void MapCatalog(this WebApplication app)
    {
        app.MapGet("/api/workspace", async (AppDb db) => Results.Ok(new
        {
            projects = await db.Projects.AsNoTracking().OrderBy(x => x.Name).ToListAsync(),
            folders = await db.Folders.AsNoTracking().OrderBy(x => x.Name).ToListAsync(),
            statuses = await db.Statuses.AsNoTracking().OrderBy(x => x.Position).ThenBy(x => x.Name).ToListAsync(),
            tags = await db.Tags.AsNoTracking().OrderBy(x => x.Name).ToListAsync(),
            users = await Access.Members(db, db.CurrentSpaceId).AsNoTracking().OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Email, x.Role, x.Active }).ToListAsync()
        })).RequireAuthorization();
        var group = app.MapGroup("/api").RequireAuthorization("page:projects");
        group.MapPost("/projects", async (ProjectInput input, AppDb db) =>
        {
            var project = new Project { SpaceId = db.CurrentSpaceId, Name = Rules.Text(input.Name, 80, "Nombre"), Description = Rules.Text(input.Description, 1000, "Descripción", false), Color = Rules.Color(input.Color) };
            project.Labels = Labels(input.Labels);
            db.Projects.Add(project);
            db.Statuses.AddRange(
                new TaskStatus { ProjectId = project.Id, Name = "Pendiente", Color = "blue", Position = 0 },
                new TaskStatus { ProjectId = project.Id, Name = "Por iniciar", Color = "orange", Position = 1 },
                new TaskStatus { ProjectId = project.Id, Name = "En progreso", Color = "purple", Position = 2 },
                new TaskStatus { ProjectId = project.Id, Name = "Resuelto", Color = "green", Position = 3, IsDone = true },
                new TaskStatus { ProjectId = project.Id, Name = "Resuelto y revisado", Color = "green", Position = 4, IsDone = true });
            await db.SaveChangesAsync(); return Results.Ok(project);
        });
        group.MapPut("/projects/{id:guid}", async (Guid id, ProjectInput input, AppDb db) =>
        {
            var p = await db.Projects.FindAsync(id); if (p == null) return Results.NotFound();
            p.Name = Rules.Text(input.Name, 80, "Nombre"); p.Description = Rules.Text(input.Description, 1000, "Descripción", false); p.Color = Rules.Color(input.Color); p.Archived = input.Archived;
            p.Labels = Labels(input.Labels);
            await db.SaveChangesAsync(); return Results.Ok(p);
        });
        group.MapDelete("/projects/{id:guid}", async (Guid id, AppDb db, IConfiguration config, ClaimsPrincipal user, ChangeFeed feed) =>
        {
            var project = await db.Projects.SingleOrDefaultAsync(p => p.Id == id);
            if (project == null) return Results.NotFound();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var tasks = await db.Tasks.Where(t => t.ProjectId == id).ToListAsync();
            if (tasks.Count > 0 && !await Access.Can(db, user, "tasks")) return Results.Forbid();
            var files = await Deletion.RemoveTasks(db, tasks, id);
            db.Folders.RemoveRange(await db.Folders.Where(f => f.ProjectId == id).ToListAsync());
            db.Statuses.RemoveRange(await db.Statuses.Where(s => s.ProjectId == id).ToListAsync());
            await db.SaveChangesAsync();
            db.Projects.Remove(project); await db.SaveChangesAsync();
            await transaction.CommitAsync();
            Deletion.RemoveFiles(files.Files, config, app.Logger);
            foreach (var focusUser in files.FocusUsers) feed.Publish(null, focusUser, "focus");
            return Results.NoContent();
        });
        group.MapPost("/folders", async (FolderInput input, AppDb db) =>
        {
            if (!await db.Projects.AnyAsync(x => x.Id == input.ProjectId && !x.Archived)) throw new InputError("Proyecto no válido.");
            var f = new Folder { ProjectId = input.ProjectId, Name = Rules.Text(input.Name, 80, "Nombre") }; db.Folders.Add(f); await db.SaveChangesAsync(); return Results.Ok(f);
        });
        group.MapPut("/folders/{id:guid}", async (Guid id, FolderInput input, AppDb db) =>
        {
            var f = await db.Folders.FindAsync(id); if (f == null) return Results.NotFound();
            f.Name = Rules.Text(input.Name, 80, "Nombre"); await db.SaveChangesAsync(); return Results.Ok(f);
        });
        group.MapDelete("/folders/{id:guid}", async (Guid id, AppDb db) =>
        {
            var f = await db.Folders.FindAsync(id); if (f == null) return Results.NotFound();
            if (await db.Tasks.AnyAsync(x => x.FolderId == id)) throw new InputError("Mueve los pendientes de esta carpeta antes de eliminarla.");
            db.Folders.Remove(f); await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapPost("/statuses", async (StatusInput input, AppDb db) =>
        {
            if (!await db.Projects.AnyAsync(x => x.Id == input.ProjectId && !x.Archived)) throw new InputError("Proyecto no válido.");
            var s = new TaskStatus { ProjectId = input.ProjectId, Name = Rules.Text(input.Name, 80, "Nombre"), Color = Rules.Color(input.Color), Position = input.Position, IsDone = input.IsDone };
            db.Statuses.Add(s); await db.SaveChangesAsync(); return Results.Ok(s);
        });
        group.MapPut("/statuses/{id:guid}", async (Guid id, StatusInput input, AppDb db) =>
        {
            var s = await db.Statuses.FindAsync(id); if (s == null) return Results.NotFound();
            if (input.IsDone && !s.IsDone && !await db.Statuses.AnyAsync(x => x.ProjectId == s.ProjectId && !x.IsDone && x.Id != id)) throw new InputError("Conserva al menos un estado abierto.");
            s.Name = Rules.Text(input.Name, 80, "Nombre"); s.Color = Rules.Color(input.Color); s.Position = input.Position; s.IsDone = input.IsDone;
            await db.SaveChangesAsync(); return Results.Ok(s);
        });
        group.MapDelete("/statuses/{id:guid}", async (Guid id, AppDb db) =>
        {
            var s = await db.Statuses.FindAsync(id); if (s == null) return Results.NotFound();
            if (await db.Tasks.AnyAsync(x => x.StatusId == id)) throw new InputError("Mueve los pendientes a otro estado antes de eliminarlo.");
            if (!s.IsDone && !await db.Statuses.AnyAsync(x => x.ProjectId == s.ProjectId && x.Id != id && !x.IsDone)) throw new InputError("Conserva al menos un estado abierto.");
            db.Statuses.Remove(s); await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapPost("/tags", async (TagInput input, AppDb db) =>
        {
            var tag = new Tag { SpaceId = db.CurrentSpaceId, Name = Rules.Text(input.Name, 30, "Etiqueta"), Color = Rules.Color(input.Color) }; db.Tags.Add(tag); await db.SaveChangesAsync(); return Results.Ok(tag);
        });
        group.MapPut("/tags/{id:guid}", async (Guid id, TagInput input, AppDb db) =>
        {
            var tag = await db.Tags.FindAsync(id); if (tag == null) return Results.NotFound();
            tag.Name = Rules.Text(input.Name, 30, "Etiqueta"); tag.Color = Rules.Color(input.Color); await db.SaveChangesAsync(); return Results.Ok(tag);
        });
        group.MapDelete("/tags/{id:guid}", async (Guid id, AppDb db) =>
        {
            var tag = await db.Tags.FindAsync(id); if (tag == null) return Results.NotFound();
            if (await db.Tasks.AnyAsync(x => x.Tags.Any(t => t.Id == id))) throw new InputError("Quita esta etiqueta de los pendientes antes de eliminarla.");
            db.Tags.Remove(tag); await db.SaveChangesAsync(); return Results.NoContent();
        });
    }
    private static string Labels(string? value)
    {
        var labels = (value ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (labels.Length > 10) throw new InputError("Máximo 10 etiquetas por proyecto.");
        return string.Join(", ", labels.Select(label => Rules.Text(label, 30, "Etiqueta de proyecto")));
    }
    public record ProjectInput(string Name, string? Description, string Color, bool Archived, string? Labels = null);
    public record FolderInput(Guid ProjectId, string Name);
    public record StatusInput(Guid ProjectId, string Name, string Color, int Position, bool IsDone);
    public record TagInput(string Name, string Color);
}
