using System.Security.Claims;
using System.Text;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class ChatEndpoints
{
    public static void MapChat(this WebApplication app)
    {
        var routes = app.MapGroup("/api/chat").RequireAuthorization("page:chat");
        routes.MapGet("/events", (HttpContext http, ChangeFeed feed, IServiceScopeFactory scopes) => feed.Stream(http, Guid.Empty, scopes));
        routes.MapGet("/users", async (AppDb db, ClaimsPrincipal user, string? q, int? page) =>
        {
            var users = Eligible(db).Where(u => u.Id != user.UserId());
            if (!string.IsNullOrWhiteSpace(q)) { var search = Rules.Text(q, 80, "Búsqueda").ToLower(); users = users.Where(u => u.Name.ToLower().Contains(search) || u.Username.ToLower().Contains(search)); }
            var p = Math.Clamp(page ?? 1, 1, 100000);
            return Results.Ok(new { items = await users.OrderBy(u => u.Name).ThenBy(u => u.Id).Skip((p - 1) * 30).Take(30).Select(u => new { u.Id, u.Name, u.Username }).ToListAsync(), total = await users.CountAsync(), page = p });
        });
        routes.MapGet("/", async (AppDb db, ClaimsPrincipal user) =>
        {
            var uid = user.UserId();
            var rooms = await db.ChatRooms.Where(r => db.ChatMembers.Any(m => m.ChatRoomId == r.Id && m.UserId == uid)).OrderByDescending(r => r.UpdatedAt)
                .Select(r => new
                {
                    r.Id,
                    r.Name,
                    isGroup = r.DirectKey == null,
                    r.OwnerId,
                    r.Version,
                    r.UpdatedAt,
                    members = db.ChatMembers.Where(m => m.ChatRoomId == r.Id).Select(m => new { m.UserId, name = db.Users.Where(u => u.Id == m.UserId).Select(u => u.Name).First(), active = db.Users.Any(u => u.Id == m.UserId && u.Active) }).ToList(),
                    unread = db.ChatMessages.Count(msg => msg.ChatRoomId == r.Id && msg.UserId != uid && msg.Sequence > db.ChatMembers.Where(m => m.ChatRoomId == r.Id && m.UserId == uid).Select(m => m.ReadSequence).First()),
                    preview = db.ChatMessages.Where(m => m.ChatRoomId == r.Id).OrderByDescending(m => m.Sequence).Select(m => m.Body != "" ? m.Body : m.TaskId != null ? "Pendiente compartido" : "Archivo adjunto").FirstOrDefault()
                }).ToListAsync();
            var preferences = await db.ChatNotificationPreferences.Where(p => p.UserId == uid).ToDictionaryAsync(p => p.ChatRoomId, p => p.Settings);
            return Results.Ok(rooms.Select(r => new { r.Id, r.Name, r.isGroup, r.OwnerId, r.Version, r.UpdatedAt, r.members, r.unread, r.preview,
                muted = ChatSilence.Parse(preferences.GetValueOrDefault(r.Id)).Muted(DateTime.UtcNow), notificationMode = ChatSilence.Parse(preferences.GetValueOrDefault(r.Id)).Mode }));
        });
        routes.MapPost("/", async (CreateInput input, AppDb db, ClaimsPrincipal user, ChangeFeed feed) =>
        {
            var uid = user.UserId(); var ids = (input.Users ?? []).Append(uid).Distinct().ToArray();
            if (ids.Length < 2 || ids.Length > 50 || !input.IsGroup && ids.Length != 2) throw new InputError("Selecciona otra persona o de 2 a 50 integrantes para un grupo.");
            if (await Eligible(db).CountAsync(u => ids.Contains(u.Id)) != ids.Length) throw new InputError("Selecciona cuentas activas con acceso a chat.");
            var key = input.IsGroup ? null : string.Join(':', ids.Order().Select(id => id.ToString("N")));
            if (key != null) { var existing = await db.ChatRooms.SingleOrDefaultAsync(r => r.DirectKey == key); if (existing != null) return Results.Ok(new { existing.Id }); }
            var room = new ChatRoom { Name = input.IsGroup ? Rules.Text(input.Name, 80, "Nombre del grupo") : "", DirectKey = key, OwnerId = uid };
            db.ChatRooms.Add(room); foreach (var id in ids) db.ChatMembers.Add(new ChatMember { ChatRoomId = room.Id, UserId = id });
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException) when (key != null) { db.ChangeTracker.Clear(); var existing = await db.ChatRooms.SingleOrDefaultAsync(r => r.DirectKey == key); if (existing == null) throw; return Results.Ok(new { existing.Id }); }
            foreach (var id in ids) feed.Publish(null, id, "chat");
            return Results.Ok(new { room.Id });
        });
        routes.MapPut("/{id:guid}", async (Guid id, GroupInput input, AppDb db, ClaimsPrincipal user, ChangeFeed feed) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var room = await Room(db, id, user.UserId(), true); if (room == null) return Results.NotFound();
            if (room.DirectKey != null || room.OwnerId != user.UserId()) return Results.Forbid();
            if (room.Version != input.Version) return Results.Conflict(new { error = "El grupo cambió. Recarga antes de editarlo." });
            var ids = (input.Users ?? []).Append(user.UserId()).Distinct().ToArray();
            if (ids.Length is < 2 or > 50 || await Eligible(db).CountAsync(u => ids.Contains(u.Id)) != ids.Length) throw new InputError("El grupo necesita de 2 a 50 cuentas activas con acceso a chat.");
            var members = await db.ChatMembers.Where(m => m.ChatRoomId == id).ToListAsync();
            foreach (var member in members.Where(m => !ids.Contains(m.UserId))) db.ChatMembers.Remove(member);
            foreach (var uid in ids.Where(uid => members.All(m => m.UserId != uid))) db.ChatMembers.Add(new ChatMember { ChatRoomId = id, UserId = uid });
            room.Name = Rules.Text(input.Name, 80, "Nombre del grupo"); room.Version = Guid.NewGuid(); room.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(); await tx.CommitAsync();
            foreach (var uid in members.Select(m => m.UserId).Union(ids)) feed.Publish(null, uid, "chat");
            return Results.NoContent();
        });
        routes.MapGet("/{id:guid}/messages", async (Guid id, long? before, AppDb db, ClaimsPrincipal user) =>
        {
            if (await Room(db, id, user.UserId()) == null) return Results.NotFound();
            var query = db.ChatMessages.AsNoTracking().Where(m => m.ChatRoomId == id);
            if (before != null) query = query.Where(m => m.Sequence < before);
            var rows = await query.OrderByDescending(m => m.Sequence).Take(51).ToListAsync();
            var more = rows.Count > 50; rows = rows.Take(50).Reverse().ToList();
            var ids = rows.Select(m => m.Id).ToArray(); var authorIds = rows.Select(m => m.UserId).Distinct().ToArray(); var authors = await db.Users.Where(u => authorIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Name);
            var files = await db.ChatFiles.Where(f => ids.Contains(f.ChatMessageId)).ToListAsync();
            var result = new List<object>();
            foreach (var row in rows)
            {
                object? task = null;
                if (row.TaskId != null)
                {
                    var item = await TaskFor(db, row.TaskId.Value, user.UserId());
                    task = item == null ? new { available = false } : (object)new { available = true, item.Id, item.Title, spaceId = await db.Projects.IgnoreQueryFilters().Where(p => p.Id == item.ProjectId).Select(p => p.SpaceId).SingleAsync() };
                }
                result.Add(new
                {
                    row.Id,
                    row.UserId,
                    author = authors[row.UserId],
                    row.ClientId,
                    row.Sequence,
                    row.Body,
                    row.CreatedAt,
                    task,
                    files = files.Where(f => f.ChatMessageId == row.Id).Select(f => new { f.Id, f.Name, f.ContentType, f.Size })
                });
            }
            return Results.Ok(new { items = result, hasMore = more });
        });
        routes.MapPost("/{id:guid}/read", async (Guid id, ReadInput input, AppDb db, ClaimsPrincipal user, ChangeFeed feed) =>
        {
            if (await Room(db, id, user.UserId()) == null) return Results.NotFound();
            if (input.Sequence < 0 || !await db.ChatMessages.AnyAsync(m => m.ChatRoomId == id && m.Sequence == input.Sequence)) throw new InputError("Mensaje no válido.");
            var changed = await db.ChatMembers.Where(m => m.ChatRoomId == id && m.UserId == user.UserId() && m.ReadSequence < input.Sequence).ExecuteUpdateAsync(s => s.SetProperty(m => m.ReadSequence, input.Sequence).SetProperty(m => m.ReadAt, DateTime.UtcNow));
            await db.ChatAlerts.Where(n => n.ChatRoomId == id && n.UserId == user.UserId() && db.ChatMessages.Any(m => m.Id == n.ChatMessageId && m.Sequence <= input.Sequence)).ExecuteDeleteAsync();
            if (changed > 0) feed.Publish(null, user.UserId(), "chat", "chat-notifications"); return Results.NoContent();
        });
        routes.MapGet("/{id:guid}/task-options", async (Guid id, Guid space, string? q, int? page, AppDb db, ClaimsPrincipal user) =>
        {
            if (await Room(db, id, user.UserId()) == null) return Results.NotFound();
            var participants = await db.ChatMembers.Where(m => m.ChatRoomId == id).Select(m => m.UserId).ToArrayAsync();
            foreach (var uid in participants) if (!await TaskAccess(db, space, uid)) return Results.Ok(new { items = Array.Empty<object>(), total = 0, page = 1 });
            var query = db.Tasks.IgnoreQueryFilters().Where(t => !t.Archived && db.Projects.IgnoreQueryFilters().Any(p => p.Id == t.ProjectId && p.SpaceId == space && !p.Archived));
            if (!string.IsNullOrWhiteSpace(q)) { var search = Rules.Text(q, 200, "Búsqueda").ToLower(); query = query.Where(t => t.Title.ToLower().Contains(search)); }
            var current = Math.Clamp(page ?? 1, 1, 100000);
            return Results.Ok(new { items = await query.OrderBy(t => t.Title).ThenBy(t => t.Id).Skip((current - 1) * 30).Take(30).Select(t => new { t.Id, t.Title }).ToListAsync(), total = await query.CountAsync(), page = current });
        });
        routes.MapPost("/{id:guid}/messages", async (Guid id, HttpRequest request, AppDb db, ClaimsPrincipal user, IConfiguration config, ChangeFeed feed, CancellationToken ct) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var room = await Room(db, id, user.UserId(), true); if (room == null) return Results.NotFound();
            if (!request.HasFormContentType) throw new InputError("Mensaje no válido.");
            var form = await request.ReadFormAsync(ct);
            if (!Guid.TryParse(form["clientId"], out var client) || client == Guid.Empty) throw new InputError("Identificador de envío no válido.");
            var previous = await db.ChatMessages.SingleOrDefaultAsync(m => m.ChatRoomId == id && m.UserId == user.UserId() && m.ClientId == client, ct);
            if (previous != null) return Results.Ok(new { previous.Id });
            var body = Rules.Text(form["body"], 4000, "Mensaje", false); Guid? taskId = null;
            if (!string.IsNullOrEmpty(form["taskId"]))
            {
                if (!Guid.TryParse(form["taskId"], out var value)) throw new InputError("Pendiente no válido.");
                var task = await TaskFor(db, value, user.UserId()); if (task == null) throw new InputError("El pendiente no está disponible.");
                var space = await db.Projects.IgnoreQueryFilters().Where(p => p.Id == task.ProjectId).Select(p => p.SpaceId).SingleAsync(ct);
                foreach (var uid in await db.ChatMembers.Where(m => m.ChatRoomId == id).Select(m => m.UserId).ToListAsync(ct))
                    if (!await TaskAccess(db, space, uid)) throw new InputError("Todos los integrantes deben tener acceso al workspace y sus pendientes.");
                taskId = value;
            }
            if (body == "" && taskId == null && form.Files.Count == 0) throw new InputError("Escribe un mensaje o adjunta contenido.");
            if (form.Files.Count > 5 || form.Files.Sum(f => f.Length) > 25 * 1024 * 1024) throw new InputError("Máximo 5 archivos y 25 MB por mensaje.");
            var message = new ChatMessage { ChatRoomId = id, UserId = user.UserId(), ClientId = client, Body = body, TaskId = taskId, Sequence = ++room.NextSequence };
            var written = new List<string>();
            var notified = new List<Guid>();
            try
            {
                foreach (var file in form.Files)
                {
                    if (file.Length < 1) throw new InputError("El archivo está vacío.");
                    var type = await FileType(file, ct);
                    if (!type.StartsWith("video/", StringComparison.Ordinal) && file.Length > 10 * 1024 * 1024) throw new InputError("Documentos e imágenes: máximo 10 MB. Videos: máximo 25 MB.");
                    var attachment = new ChatFile { ChatMessageId = message.Id, Name = Rules.Text(Path.GetFileName(file.FileName.Replace('\\', '/')), 200, "Archivo"), ContentType = type, Size = file.Length };
                    var directory = Path.Combine(Path.GetFullPath(config["StoragePath"] ?? "uploads"), "chat"); Directory.CreateDirectory(directory);
                    var path = Path.Combine(directory, attachment.Id.ToString("N")); written.Add(path);
                    await using (var output = File.Create(path)) await file.CopyToAsync(output, ct);
                    db.ChatFiles.Add(attachment);
                }
                room.UpdatedAt = message.CreatedAt; db.ChatMessages.Add(message);
                notified = await ChatNotificationEvents.Stage(db, message, ct);
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            }
            catch { foreach (var path in written) File.Delete(path); throw; }
            foreach (var uid in await db.ChatMembers.Where(m => m.ChatRoomId == id).Select(m => m.UserId).ToListAsync(ct)) feed.Publish(null, uid, "chat");
            foreach (var uid in notified) feed.Publish(null, uid, "chat-notifications");
            return Results.Ok(new { message.Id });
        });
        routes.MapGet("/files/{id:guid}", async (Guid id, bool? download, AppDb db, ClaimsPrincipal user, IConfiguration config) =>
        {
            var file = await db.ChatFiles.SingleOrDefaultAsync(f => f.Id == id); if (file == null) return Results.NotFound();
            var room = await db.ChatMessages.Where(m => m.Id == file.ChatMessageId).Select(m => m.ChatRoomId).SingleAsync();
            if (await Room(db, room, user.UserId()) == null) return Results.NotFound();
            var path = Path.Combine(Path.GetFullPath(config["StoragePath"] ?? "uploads"), "chat", file.Id.ToString("N"));
            var inline = download != true && (file.ContentType.StartsWith("image/", StringComparison.Ordinal) || file.ContentType.StartsWith("video/", StringComparison.Ordinal));
            return File.Exists(path) ? Results.File(path, file.ContentType, inline ? null : file.Name, enableRangeProcessing: true) : Results.NotFound();
        });
    }
    private static IQueryable<User> Eligible(AppDb db) => db.Users.Where(u => u.Active && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "chat" && p.Allowed)));
    private static async Task<ChatRoom?> Room(AppDb db, Guid id, Guid uid, bool locked = false)
    {
        if (!await db.ChatMembers.AnyAsync(m => m.ChatRoomId == id && m.UserId == uid)) return null;
        if (locked && db.Database.IsNpgsql()) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"ChatRooms\" WHERE \"Id\" = {id} FOR UPDATE");
        if (locked && !await db.ChatMembers.AnyAsync(m => m.ChatRoomId == id && m.UserId == uid)) return null;
        return await db.ChatRooms.SingleOrDefaultAsync(r => r.Id == id);
    }
    private static async Task<bool> TaskAccess(AppDb db, Guid space, Guid uid) => await Access.SpacesFor(db, uid).AnyAsync(s => s.Id == space) && await db.Users.AnyAsync(u => u.Id == uid && u.Active && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "tasks" && p.Allowed)));
    private static async Task<WorkItem?> TaskFor(AppDb db, Guid id, Guid uid)
    {
        var item = await db.Tasks.IgnoreQueryFilters().SingleOrDefaultAsync(t => t.Id == id); if (item == null) return null;
        var space = await db.Projects.IgnoreQueryFilters().Where(p => p.Id == item.ProjectId).Select(p => p.SpaceId).SingleAsync();
        return await TaskAccess(db, space, uid) ? item : null;
    }
    private static async Task<string> FileType(IFormFile file, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream(); var header = new byte[12]; var count = await stream.ReadAsync(header, ct);
        if (count >= 8 && header.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        if (count >= 3 && header[0] == 255 && header[1] == 216 && header[2] == 255) return "image/jpeg";
        if (count >= 12 && Encoding.ASCII.GetString(header, 0, 4) == "RIFF" && Encoding.ASCII.GetString(header, 8, 4) == "WEBP") return "image/webp";
        if (count >= 6 && Encoding.ASCII.GetString(header, 0, 6) is "GIF87a" or "GIF89a") return "image/gif";
        if (count >= 5 && Encoding.ASCII.GetString(header, 0, 5) == "%PDF-") return "application/pdf";
        if (count >= 8 && Encoding.ASCII.GetString(header, 4, 4) == "ftyp" && Path.GetExtension(file.FileName).Equals(".mp4", StringComparison.OrdinalIgnoreCase)) return "video/mp4";
        if (count >= 4 && header.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 }) && Path.GetExtension(file.FileName).Equals(".webm", StringComparison.OrdinalIgnoreCase)) return "video/webm";
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (count >= 4 && header[0] == 'P' && header[1] == 'K' && header[2] == 3 && header[3] == 4 && new[] { ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".zip" }.Contains(ext)) return "application/octet-stream";
        if (new[] { ".txt", ".md", ".csv", ".log", ".json" }.Contains(ext))
        {
            if (file.Length > 10 * 1024 * 1024) throw new InputError("Documentos: máximo 10 MB.");
            stream.Position = 0; using var reader = new StreamReader(stream, new UTF8Encoding(false, true), true);
            try { var text = await reader.ReadToEndAsync(ct); if (!text.Contains('\0')) return "text/plain"; } catch (DecoderFallbackException) { }
        }
        throw new InputError("Formatos: PNG, JPG, WebP, GIF, PDF, documentos Office/OpenDocument, ZIP, texto UTF-8, MP4 y WebM.");
    }
    public record CreateInput(bool IsGroup, string? Name, Guid[]? Users);
    public record GroupInput(string Name, Guid[]? Users, Guid Version);
    public record ReadInput(long Sequence);
}
