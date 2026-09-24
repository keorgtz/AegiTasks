using System.Security.Claims;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class TaskEndpoints
{
    public static void MapTasks(this WebApplication app)
    {
        var group = app.MapGroup("/api/tasks").RequireAuthorization("page:tasks");
        group.MapGet("/", async (AppDb db, ClaimsPrincipal user, Guid? project, Guid? folder, Guid? status, Guid? tag, int? priority, string? q, string? scope, string? sort, int? page) =>
        {
            var query = db.Tasks.AsNoTracking().Where(x => x.Archived == (scope == "archived") && db.Projects.Any(p => p.Id == x.ProjectId && !p.Archived));
            if (project != null) query = query.Where(x => x.ProjectId == project);
            if (folder != null) query = query.Where(x => x.FolderId == folder);
            if (status != null) query = query.Where(x => x.StatusId == status);
            if (tag != null) query = query.Where(x => x.Tags.Any(t => t.Id == tag));
            if (priority != null) query = priority == 0 ? query.Where(x => x.Priority == null) : query.Where(x => x.Priority == priority);
            if (!string.IsNullOrWhiteSpace(q)) { var search = Rules.Text(q, 200, "Búsqueda").ToLower(); query = query.Where(x => x.Title.ToLower().Contains(search) || x.Description.ToLower().Contains(search)); }
            if (scope == "mine") { var id = user.UserId(); query = query.Where(x => x.AssigneeId == id); }
            if (scope == "reported") { var id = user.UserId(); query = query.Where(x => x.CreatedById == id); }
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            if (scope is "open" or "overdue" or "urgent") query = query.Where(x => db.Statuses.Any(s => s.Id == x.StatusId && !s.IsDone));
            if (scope == "done") query = query.Where(x => db.Statuses.Any(s => s.Id == x.StatusId && s.IsDone));
            if (scope == "overdue") query = query.Where(x => x.DueDate < today);
            if (scope == "urgent") query = query.Where(x => x.Priority >= 3);
            var total = await query.CountAsync();
            query = sort switch
            {
                "due" => query.OrderBy(x => x.DueDate == null).ThenBy(x => x.DueDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
                "newest" => query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id),
                _ => query.OrderByDescending(x => x.Priority ?? 0).ThenBy(x => x.DueDate == null).ThenBy(x => x.DueDate).ThenByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
            };
            var currentPage = Math.Clamp(page ?? 1, 1, 100000);
            var items = await query.Skip((currentPage - 1) * 50).Take(50).Include(x => x.Tags).ToListAsync();
            return Results.Ok(new { items, total, page = currentPage, pageSize = 50 });
        });
        group.MapGet("/summary", async (AppDb db) =>
        {
            var query = db.Tasks.AsNoTracking().Where(x => !x.Archived && db.Projects.Any(p => p.Id == x.ProjectId && !p.Archived));
            var open = query.Where(x => db.Statuses.Any(s => s.Id == x.StatusId && !s.IsDone));
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(new { open = await open.CountAsync(), urgent = await open.CountAsync(x => x.Priority >= 3), overdue = await open.CountAsync(x => x.DueDate < today), done = await query.CountAsync(x => db.Statuses.Any(s => s.Id == x.StatusId && s.IsDone)) });
        });
        group.MapGet("/{id:guid}", async (Guid id, AppDb db) =>
        {
            var item = await db.Tasks.AsNoTracking().Include(x => x.Tags).SingleOrDefaultAsync(x => x.Id == id);
            if (item == null) return Results.NotFound();
            return Results.Ok(new { item, activities = await db.Activities.AsNoTracking().Where(x => x.WorkItemId == id).OrderBy(x => x.CreatedAt).ToListAsync(), attachments = await db.Attachments.AsNoTracking().Where(x => x.WorkItemId == id).OrderBy(x => x.CreatedAt).ToListAsync() });
        });
        group.MapPost("/", async (TaskInput input, AppDb db, ClaimsPrincipal user) =>
        {
            var item = new WorkItem { CreatedById = user.UserId() }; await Rules.ApplyTask(db, item, input);
            db.Tasks.Add(item); Rules.Log(db, item.Id, user.UserId(), "Creó el pendiente."); await db.SaveChangesAsync(); return Results.Ok(item);
        });
        group.MapPut("/{id:guid}", async (Guid id, TaskInput input, AppDb db, ClaimsPrincipal user) =>
        {
            var item = await db.Tasks.Include(x => x.Tags).SingleOrDefaultAsync(x => x.Id == id); if (item == null) return Results.NotFound();
            if (item.Version != input.Version) return Results.Json(new { error = "Otra persona actualizó este pendiente. Cierra y vuelve a abrirlo antes de guardar." }, statusCode: 409);
            var oldStatus = item.StatusId; await Rules.ApplyTask(db, item, input);
            item.Version = Guid.NewGuid(); item.UpdatedAt = DateTime.UtcNow;
            var message = oldStatus == item.StatusId ? "Actualizó los detalles del pendiente." : $"Cambió el estado a {(await db.Statuses.FindAsync(item.StatusId))!.Name}.";
            Rules.Log(db, item.Id, user.UserId(), message); await db.SaveChangesAsync(); return Results.Ok(item);
        });
        group.MapPost("/{id:guid}/archive", async (Guid id, ArchiveInput input, AppDb db, ClaimsPrincipal user) =>
        {
            var item = await db.Tasks.FindAsync(id); if (item == null) return Results.NotFound();
            if (item.Version != input.Version) return Results.Conflict(new { error = "El pendiente cambió. Vuelve a abrirlo." });
            item.Archived = input.Archived; item.Version = Guid.NewGuid(); item.UpdatedAt = DateTime.UtcNow;
            Rules.Log(db, id, user.UserId(), input.Archived ? "Archivó el pendiente." : "Restauró el pendiente."); await db.SaveChangesAsync(); return Results.Ok(item);
        });
        group.MapPost("/{id:guid}/comments", async (Guid id, CommentInput input, AppDb db, ClaimsPrincipal user) =>
        {
            if (!await db.Tasks.AnyAsync(x => x.Id == id)) return Results.NotFound();
            Rules.Log(db, id, user.UserId(), Rules.Text(input.Body, 4000, "Comentario"), "comment"); await db.SaveChangesAsync(); return Results.NoContent();
        });
        group.MapPost("/{id:guid}/attachments", async (Guid id, HttpRequest request, AppDb db, ClaimsPrincipal user, IConfiguration config, CancellationToken ct) =>
        {
            if (!await db.Tasks.AnyAsync(x => x.Id == id, ct)) return Results.NotFound();
            if (await db.Attachments.CountAsync(x => x.WorkItemId == id, ct) >= 20) throw new InputError("Máximo 20 archivos por pendiente.");
            if (!request.HasFormContentType) throw new InputError("Selecciona un archivo.");
            var form = await request.ReadFormAsync(ct); var file = form.Files.GetFile("file");
            if (file == null || file.Length is < 1 or > 10 * 1024 * 1024) throw new InputError("Adjunta una imagen o PDF de hasta 10 MB.");
            await using var stream = file.OpenReadStream(); var header = new byte[12]; var count = await stream.ReadAsync(header, ct); stream.Position = 0;
            var type = count >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ? "image/png" : count >= 3 && header[0] == 255 && header[1] == 216 && header[2] == 255 ? "image/jpeg" : count >= 12 && System.Text.Encoding.ASCII.GetString(header, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(header, 8, 4) == "WEBP" ? "image/webp" : count >= 5 && System.Text.Encoding.ASCII.GetString(header, 0, 5) == "%PDF-" ? "application/pdf" : null;
            if (type == null) throw new InputError("Formatos permitidos: PNG, JPG, WebP y PDF.");
            var attachment = new Attachment { WorkItemId = id, UserId = user.UserId(), Name = Rules.Text(Path.GetFileName(file.FileName), 200, "Archivo"), Size = file.Length, ContentType = type };
            var dir = Path.GetFullPath(config["StoragePath"] ?? "uploads"); Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, attachment.Id.ToString("N"));
            try
            {
                await using (var output = File.Create(path)) await stream.CopyToAsync(output, ct);
                db.Attachments.Add(attachment); Rules.Log(db, id, user.UserId(), $"Adjuntó {attachment.Name}."); await db.SaveChangesAsync(ct);
            }
            catch { File.Delete(path); throw; }
            return Results.Ok(attachment);
        });
        app.MapGet("/api/attachments/{id:guid}", async (Guid id, AppDb db, IConfiguration config) =>
        {
            var a = await db.Attachments.FindAsync(id); if (a == null) return Results.NotFound();
            var path = Path.Combine(Path.GetFullPath(config["StoragePath"] ?? "uploads"), id.ToString("N"));
            return File.Exists(path) ? Results.File(path, a.ContentType, a.Name) : Results.NotFound();
        }).RequireAuthorization("page:tasks");
    }
    public record ArchiveInput(bool Archived, Guid Version);
    public record CommentInput(string Body);
}
