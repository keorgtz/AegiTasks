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
        group.MapGet("/", async (AppDb db, ClaimsPrincipal user, Guid? project, Guid? folder, Guid? status, Guid? tag, int? priority, string? q, string? scope, string? sort, int? page, string? assignee, string? module, string? cycle) =>
        {
            var query = db.Tasks.AsNoTracking().Where(x => x.Archived == (scope == "archived") && db.Projects.Any(p => p.Id == x.ProjectId && !p.Archived));
            query = query.ForAssignee(assignee, user.UserId());
            if (project != null) query = query.Where(x => x.ProjectId == project);
            if (folder != null) query = query.Where(x => x.FolderId == folder);
            if (module == "none") query = query.Where(x => x.ModuleId == null);
            else if (!string.IsNullOrEmpty(module)) { if (!Guid.TryParse(module, out var moduleId)) throw new InputError("Módulo no válido."); query = query.Where(x => x.ModuleId == moduleId); }
            if (cycle == "none") query = query.Where(x => x.CycleId == null);
            else if (!string.IsNullOrEmpty(cycle)) { if (!Guid.TryParse(cycle, out var cycleId)) throw new InputError("Ciclo no válido."); query = query.Where(x => x.CycleId == cycleId); }
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
        group.MapGet("/summary", async (AppDb db, ClaimsPrincipal user, string? assignee) =>
        {
            var query = db.Tasks.AsNoTracking().Where(x => !x.Archived && db.Projects.Any(p => p.Id == x.ProjectId && !p.Archived));
            query = query.ForAssignee(assignee, user.UserId());
            var open = query.Where(x => db.Statuses.Any(s => s.Id == x.StatusId && !s.IsDone));
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            return Results.Ok(new { open = await open.CountAsync(), urgent = await open.CountAsync(x => x.Priority >= 3), overdue = await open.CountAsync(x => x.DueDate < today), done = await query.CountAsync(x => db.Statuses.Any(s => s.Id == x.StatusId && s.IsDone)) });
        });
        group.MapGet("/{id:guid}", async (Guid id, AppDb db) =>
        {
            var item = await db.Tasks.AsNoTracking().Include(x => x.Tags).SingleOrDefaultAsync(x => x.Id == id);
            if (item == null) return Results.NotFound();
            var children = db.Tasks.AsNoTracking().Where(t => t.ParentTaskId == id);
            return Results.Ok(new { item,
                parent = item.ParentTaskId == null ? null : await db.Tasks.AsNoTracking().Where(t => t.Id == item.ParentTaskId).Select(t => new { t.Id, t.Title, t.ProjectId, t.StatusId, t.AssigneeId, t.Archived, t.Version }).SingleOrDefaultAsync(),
                children = new { total = await children.CountAsync(t => !t.Archived), done = await children.CountAsync(t => !t.Archived && db.Statuses.Any(s => s.Id == t.StatusId && s.IsDone)), archived = await children.CountAsync(t => t.Archived) },
                activities = await db.Activities.AsNoTracking().Where(x => x.WorkItemId == id).OrderBy(x => x.CreatedAt).ToListAsync(), attachments = await db.Attachments.AsNoTracking().Where(x => x.WorkItemId == id).OrderBy(x => x.CreatedAt).ToListAsync() });
        });
        group.MapGet("/{id:guid}/children", async (Guid id, int? page, string? q, bool? archived, AppDb db) => {
            if (!await db.Tasks.AnyAsync(t => t.Id == id)) return Results.NotFound();
            var query = db.Tasks.AsNoTracking().Where(t => t.ParentTaskId == id && (archived == true || !t.Archived));
            if (!string.IsNullOrWhiteSpace(q)) { var search = Rules.Text(q, 200, "Búsqueda").ToLower(); query = query.Where(t => t.Title.ToLower().Contains(search)); }
            var currentPage = Math.Clamp(page ?? 1, 1, 100000);
            return Results.Ok(new { items = await query.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id).Skip((currentPage - 1) * 50).Take(50).Include(t => t.Tags).ToListAsync(), total = await query.CountAsync(), page = currentPage, pageSize = 50 });
        });
        group.MapGet("/parent-options", async (Guid project, Guid? exclude, string? relation, string? q, int? page, AppDb db) => {
            if (!await db.Projects.AnyAsync(p => p.Id == project && !p.Archived)) return Results.NotFound();
            if (exclude != null && !await db.Tasks.AnyAsync(t => t.Id == exclude && t.ProjectId == project)) return Results.NotFound();
            if (relation is not (null or "parent" or "child")) throw new InputError("Relación no válida.");
            var excluded = new HashSet<Guid>();
            if (exclude != null) {
                var links = await db.Tasks.AsNoTracking().Where(t => t.ProjectId == project).Select(t => new { t.Id, t.ParentTaskId }).ToListAsync();
                excluded.Add(exclude.Value);
                if (relation == "child") {
                    var parents = links.ToDictionary(t => t.Id, t => t.ParentTaskId); var cursor = parents[exclude.Value];
                    while (cursor != null && excluded.Add(cursor.Value)) cursor = parents.GetValueOrDefault(cursor.Value);
                } else {
                    var children = links.Where(t => t.ParentTaskId != null).ToLookup(t => t.ParentTaskId!.Value, t => t.Id);
                    var queue = new Queue<Guid>(); queue.Enqueue(exclude.Value);
                    while (queue.TryDequeue(out var next)) foreach (var child in children[next]) if (excluded.Add(child)) queue.Enqueue(child);
                }
            }
            var query = db.Tasks.AsNoTracking().Where(t => t.ProjectId == project && !t.Archived && !excluded.Contains(t.Id));
            if (relation == "child") query = query.Where(t => t.ParentTaskId != exclude);
            if (!string.IsNullOrWhiteSpace(q)) { var search = Rules.Text(q, 200, "Búsqueda").ToLower(); query = query.Where(t => t.Title.ToLower().Contains(search)); }
            var currentPage = Math.Clamp(page ?? 1, 1, 100000);
            return Results.Ok(new { items = await query.OrderBy(t => t.Title).ThenBy(t => t.Id).Skip((currentPage - 1) * 50).Take(50).Include(t => t.Tags).ToListAsync(), total = await query.CountAsync(), page = currentPage, pageSize = 50 });
        });
        group.MapPost("/", async (TaskInput input, AppDb db, ClaimsPrincipal user) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(); await TaskHierarchy.LockProjects(db, input.ProjectId);
            var item = new WorkItem { CreatedById = user.UserId() }; await Rules.ApplyTask(db, item, input);
            db.Tasks.Add(item); Rules.Log(db, item.Id, user.UserId(), "Creó el pendiente."); await db.SaveChangesAsync(); await transaction.CommitAsync(); return Results.Ok(item);
        });
        group.MapPut("/{id:guid}", async (Guid id, TaskInput input, AppDb db, ClaimsPrincipal user) =>
        {
            var originalProject = await db.Tasks.AsNoTracking().Where(t => t.Id == id).Select(t => (Guid?)t.ProjectId).SingleOrDefaultAsync();
            if (originalProject == null) return Results.NotFound();
            await using var transaction = await db.Database.BeginTransactionAsync(); await TaskHierarchy.LockProjects(db, originalProject.Value, input.ProjectId);
            var item = await db.Tasks.Include(x => x.Tags).SingleOrDefaultAsync(x => x.Id == id); if (item == null) return Results.NotFound();
            if (item.Version != input.Version) return Results.Json(new { error = "Otra persona actualizó este pendiente. Cierra y vuelve a abrirlo antes de guardar." }, statusCode: 409);
            var oldStatus = item.StatusId; await Rules.ApplyTask(db, item, input);
            item.Version = Guid.NewGuid(); item.UpdatedAt = DateTime.UtcNow;
            var message = oldStatus == item.StatusId ? "Actualizó los detalles del pendiente." : $"Cambió el estado a {(await db.Statuses.FindAsync(item.StatusId))!.Name}.";
            Rules.Log(db, item.Id, user.UserId(), message); await db.SaveChangesAsync(); await transaction.CommitAsync(); return Results.Ok(item);
        });
        group.MapPut("/{id:guid}/parent", async (Guid id, ParentChangeInput input, AppDb db, ClaimsPrincipal user) => {
            var projectId = await db.Tasks.AsNoTracking().Where(t => t.Id == id).Select(t => (Guid?)t.ProjectId).SingleOrDefaultAsync();
            if (projectId == null) return Results.NotFound();
            await using var transaction = await db.Database.BeginTransactionAsync(); await TaskHierarchy.LockProjects(db, projectId.Value);
            var item = await db.Tasks.SingleOrDefaultAsync(t => t.Id == id); if (item == null) return Results.NotFound();
            if (item.Version != input.Version) return Results.Conflict(new { error = "El pendiente cambió. Recarga la relación antes de guardar." });
            if (item.Archived || !await db.Projects.AnyAsync(p => p.Id == item.ProjectId && !p.Archived)) throw new InputError("Restaura el pendiente y su proyecto antes de cambiar el padre.");
            await TaskHierarchy.Apply(db, item, new TaskHierarchyInput(input.ParentTaskId), item.ProjectId);
            item.Version = Guid.NewGuid(); item.UpdatedAt = DateTime.UtcNow;
            Rules.Log(db, id, user.UserId(), input.ParentTaskId == null ? "Retiró la relación con el pendiente padre." : "Actualizó el pendiente padre.");
            await db.SaveChangesAsync(); await transaction.CommitAsync(); return Results.Ok(item);
        });
        group.MapPut("/{id:guid}/status", async (Guid id, StatusChangeInput input, AppDb db, ClaimsPrincipal user) =>
        {
            var item = await db.Tasks.Include(t => t.Tags).SingleOrDefaultAsync(t => t.Id == id);
            if (item == null) return Results.NotFound();
            if (item.Version != input.Version) return Results.Conflict(new { error = "El pendiente cambió. Actualiza antes de volver a intentarlo." });
            if (item.Archived || !await db.Projects.AnyAsync(p => p.Id == item.ProjectId && !p.Archived)) throw new InputError("Restaura el pendiente y su proyecto antes de cambiar el estado.");
            var status = await db.Statuses.SingleOrDefaultAsync(s => s.Id == input.StatusId && s.ProjectId == item.ProjectId);
            if (status == null) throw new InputError("Selecciona un estado de este pendiente.");
            item.StatusId = status.Id; item.Version = Guid.NewGuid(); item.UpdatedAt = DateTime.UtcNow;
            Rules.Log(db, id, user.UserId(), $"Cambió el estado a {status.Name}.");
            await db.SaveChangesAsync(); return Results.Ok(item);
        });
        group.MapDelete("/{id:guid}", async (Guid id, Guid version, AppDb db, IConfiguration config, ChangeFeed feed, ClaimsPrincipal user) =>
        {
            var projectId = await db.Tasks.AsNoTracking().Where(t => t.Id == id).Select(t => (Guid?)t.ProjectId).SingleOrDefaultAsync();
            if (projectId == null) return Results.NotFound();
            await using var transaction = await db.Database.BeginTransactionAsync(); await TaskHierarchy.LockProjects(db, projectId.Value);
            var item = await db.Tasks.SingleOrDefaultAsync(t => t.Id == id);
            if (item == null) return Results.NotFound();
            if (item.Version != version) return Results.Conflict(new { error = "El pendiente cambió. Vuelve a abrirlo antes de eliminarlo." });
            var files = await Deletion.RemoveTasks(db, [item], actorId: user.UserId());
            await transaction.CommitAsync();
            Deletion.RemoveFiles(files.Files, config, app.Logger);
            foreach (var focusUser in files.FocusUsers) feed.Publish(null, focusUser, "focus");
            return Results.NoContent();
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
    public record StatusChangeInput(Guid StatusId, Guid Version);
    public record CommentInput(string Body);
    public record ParentChangeInput(Guid? ParentTaskId, Guid Version);
}
