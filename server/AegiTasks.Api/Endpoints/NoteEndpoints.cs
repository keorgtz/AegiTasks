using System.Security.Claims;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;
public static class NoteEndpoints
{
    public static void MapNotes(this WebApplication app)
    {
        var folders = app.MapGroup("/api/note-folders").RequireAuthorization("page:notes");
        folders.MapGet("/", async (AppDb db) => await db.NoteFolders.AsNoTracking().OrderBy(x => x.Name).ToListAsync());
        folders.MapPost("/", async (FolderInput input, AppDb db) => {
            await ValidateParent(db, input.ParentId, null);
            var f = new NoteFolder { SpaceId = db.CurrentSpaceId, Name = Rules.Text(input.Name, 80, "Carpeta"), ParentId = input.ParentId };
            db.NoteFolders.Add(f); await db.SaveChangesAsync(); return Results.Ok(f);
        });
        folders.MapPut("/{id:guid}", async (Guid id, FolderInput input, AppDb db) => {
            await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable);
            var f = await db.NoteFolders.SingleOrDefaultAsync(x => x.Id == id); if (f == null) return Results.NotFound();
            await ValidateParent(db, input.ParentId, id);
            f.Name = Rules.Text(input.Name, 80, "Carpeta"); f.ParentId = input.ParentId;
            await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(f);
        });
        folders.MapDelete("/{id:guid}", async (Guid id, AppDb db) => {
            var f = await db.NoteFolders.SingleOrDefaultAsync(x => x.Id == id); if (f == null) return Results.NotFound();
            if (await db.NoteFolders.AnyAsync(x => x.ParentId == id) || await db.Notes.AnyAsync(x => x.FolderId == id)) throw new InputError("Mueve primero las notas y subcarpetas, incluidas las notas archivadas.");
            db.NoteFolders.Remove(f); await db.SaveChangesAsync(); return Results.NoContent();
        });
        var notes = app.MapGroup("/api/notes").RequireAuthorization("page:notes");
        notes.MapGet("/", async (AppDb db, Guid? folder, string? q, bool? archived, Guid? project) => {
            var query = db.Notes.AsNoTracking().Where(n => n.Archived == (archived ?? false));
            if (folder != null) query = query.Where(n => n.FolderId == folder);
            if (project != null) query = query.Where(n => n.ProjectId == project);
            if (!string.IsNullOrWhiteSpace(q)) { var text = Rules.Text(q, 200, "Búsqueda").ToLower(); query = query.Where(n => n.Title.ToLower().Contains(text) || n.Markdown.ToLower().Contains(text)); }
            return Results.Ok(await query.OrderByDescending(n => n.Pinned).ThenByDescending(n => n.UpdatedAt).Select(n => new { n.Id, n.SpaceId, n.Title, n.FolderId, n.ProjectId, n.Color, n.Font, n.Pinned, n.Archived, n.UpdatedAt, n.Version, n.LinkedTaskId }).ToListAsync());
        });
        notes.MapGet("/export", async (AppDb db) => Results.Ok(new { notes = await db.Notes.AsNoTracking().ToListAsync(), folders = await db.NoteFolders.AsNoTracking().ToListAsync() }));
        notes.MapGet("/{id:guid}", async (Guid id, AppDb db) => await db.Notes.AsNoTracking().SingleOrDefaultAsync(n => n.Id == id) is { } note ? Results.Ok(note) : Results.NotFound());
        notes.MapPost("/", async (NoteInput input, AppDb db, ClaimsPrincipal user) => {
            var note = new Note { SpaceId = db.CurrentSpaceId, CreatedById = user.UserId() }; await Apply(db, note, input); db.Notes.Add(note); await db.SaveChangesAsync(); return Results.Ok(note);
        });
        notes.MapPut("/{id:guid}", async (Guid id, NoteInput input, AppDb db) => {
            var note = await db.Notes.SingleOrDefaultAsync(n => n.Id == id); if (note == null) return Results.NotFound();
            if (input.Version != note.Version) return Results.Conflict(new { error = "La nota fue modificada por otra persona. Conserva tu borrador y vuelve a abrirla para comparar." });
            await Apply(db, note, input); note.UpdatedAt = DateTime.UtcNow; note.Version = Guid.NewGuid(); await db.SaveChangesAsync(); return Results.Ok(note);
        });
        notes.MapPost("/{id:guid}/task", async (Guid id, TaskFromNote input, AppDb db, ClaimsPrincipal user) => {
            var note = await db.Notes.SingleOrDefaultAsync(n => n.Id == id); if (note == null) return Results.NotFound();
            if (note.LinkedTaskId is { } existing) return Results.Ok(new { id = existing });
            if (note.Version != input.Version) return Results.Conflict(new { error = "La nota cambió; vuelve a abrirla." });
            var status = await db.Statuses.Where(s => s.ProjectId == input.ProjectId && !s.IsDone).OrderBy(s => s.Position).FirstOrDefaultAsync();
            if (status == null || !await db.Projects.AnyAsync(p => p.Id == input.ProjectId && !p.Archived)) throw new InputError("Selecciona un proyecto activo de este espacio.");
            var task = new WorkItem { ProjectId = input.ProjectId, StatusId = status.Id, Title = note.Title, Description = note.Markdown.Length > 12000 ? note.Markdown[..12000] : note.Markdown, CreatedById = user.UserId() };
            db.Tasks.Add(task); Rules.Log(db, task.Id, user.UserId(), "Creó el pendiente desde una nota. La nota original se conserva.");
            note.LinkedTaskId = task.Id; note.Version = Guid.NewGuid(); await db.SaveChangesAsync(); return Results.Ok(new { task.Id });
        }).RequireAuthorization("page:tasks");
    }
    private static async Task Apply(AppDb db, Note n, NoteInput input)
    {
        n.Title = Rules.Text(input.Title, 200, "Título");
        if ((input.Markdown?.Length ?? 0) > 200000) throw new InputError("La nota admite hasta 200000 caracteres.");
        if (input.FolderId != null && !await db.NoteFolders.AnyAsync(f => f.Id == input.FolderId)) throw new InputError("Carpeta no válida para este espacio.");
        if (input.ProjectId != null && !await db.Projects.AnyAsync(p => p.Id == input.ProjectId)) throw new InputError("Proyecto no válido para este espacio.");
        if (input.Font is not ("sans" or "serif" or "mono" or "lora" or "source-serif" or "jetbrains" or "nunito" or "plex")) throw new InputError("Tipografía no válida.");
        n.Markdown = input.Markdown ?? ""; n.Color = Rules.Color(input.Color); n.Font = input.Font; n.FolderId = input.FolderId; n.ProjectId = input.ProjectId; n.Pinned = input.Pinned; n.Archived = input.Archived;
    }
    private static async Task ValidateParent(AppDb db, Guid? parent, Guid? self)
    {
        var visited = new HashSet<Guid>(); var depth = 0;
        while (parent != null) {
            if (parent == self || !visited.Add(parent.Value)) throw new InputError("Una carpeta no puede contenerse a sí misma.");
            if (++depth > 16) throw new InputError("Máximo 16 niveles de carpetas.");
            var folder = await db.NoteFolders.SingleOrDefaultAsync(f => f.Id == parent); if (folder == null) throw new InputError("La carpeta superior no pertenece al espacio.");
            parent = folder.ParentId;
        }
    }
    public record FolderInput(string Name, Guid? ParentId);
    public record NoteInput(string Title, string? Markdown, Guid? FolderId, Guid? ProjectId, string Color, string Font, bool Pinned, bool Archived, Guid? Version);
    public record TaskFromNote(Guid ProjectId, Guid Version);
}
