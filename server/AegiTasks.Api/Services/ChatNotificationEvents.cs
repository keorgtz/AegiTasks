using AegiTasks.Api.Data;
using System.Text;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public static class ChatNotificationEvents
{
    public static IQueryable<ChatAlert> Visible(AppDb db, Guid uid, DateTime now) => db.ChatAlerts.Where(n => n.UserId == uid && n.CreatedAt > now.AddDays(-1) &&
        db.Users.Any(u => u.Id == uid && u.Active && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "chat" && p.Allowed))) &&
        db.ChatMembers.Any(m => m.UserId == uid && m.ChatRoomId == n.ChatRoomId && db.ChatMessages.Any(msg => msg.Id == n.ChatMessageId && msg.ChatRoomId == n.ChatRoomId && msg.Sequence > m.ReadSequence)));
    public static async Task<bool> Muted(AppDb db, Guid room, Guid uid, DateTime now, CancellationToken ct = default) =>
        ChatSilence.Parse(await db.ChatNotificationPreferences.Where(p => p.ChatRoomId == room && p.UserId == uid).Select(p => p.Settings).SingleOrDefaultAsync(ct)).Muted(now);
    public static async Task<List<Guid>> Stage(AppDb db, ChatMessage message, CancellationToken ct)
    {
        var ids = await db.ChatMembers.Where(m => m.ChatRoomId == message.ChatRoomId && m.UserId != message.UserId && db.Users.Any(u => u.Id == m.UserId && u.Active &&
            (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "chat" && p.Allowed)))).Select(m => m.UserId).ToListAsync(ct);
        var recipients = new List<Guid>();
        foreach (var uid in ids) {
            if (await Muted(db, message.ChatRoomId, uid, message.CreatedAt, ct)) continue;
            var alert = new ChatAlert { ChatRoomId = message.ChatRoomId, UserId = uid, ChatMessageId = message.Id, CreatedAt = message.CreatedAt };
            db.ChatAlerts.Add(alert); recipients.Add(uid);
            foreach (var device in await db.PushDevices.Where(d => d.UserId == uid && db.Users.Any(u => u.Id == uid && u.SessionVersion == d.SessionVersion)).Select(d => d.Id).ToListAsync(ct))
                db.ChatPushDeliveries.Add(new ChatPushDelivery { NotificationId = alert.Id, DeviceId = device });
        }
        return recipients;
    }
    public static async Task<ChatNotice?> Summary(AppDb db, Guid roomId, Guid uid, DateTime now, CancellationToken ct = default)
    {
        if (await Muted(db, roomId, uid, now, ct)) return null;
        var query = Visible(db, uid, now).Where(n => n.ChatRoomId == roomId);
        var count = await query.CountAsync(ct); if (count == 0) return null;
        var room = await db.ChatRooms.AsNoTracking().SingleAsync(r => r.Id == roomId, ct);
        var rows = await query.Join(db.ChatMessages, n => n.ChatMessageId, m => m.Id, (n, m) => new { noticeId = n.Id, m.Sequence, m.Body, m.Id, author = db.Users.Where(u => u.Id == m.UserId).Select(u => u.Name).First(), m.CreatedAt, hasTask = m.TaskId != null,
            fileCount = db.ChatFiles.Count(f => f.ChatMessageId == m.Id), hasGif = db.ChatFiles.Any(f => f.ChatMessageId == m.Id && f.ContentType == "image/gif") }).OrderByDescending(m => m.Sequence).Take(5).ToListAsync(ct);
        var title = room.DirectKey == null ? room.Name : await db.ChatMembers.Where(m => m.ChatRoomId == roomId && m.UserId != uid).Select(m => db.Users.Where(u => u.Id == m.UserId).Select(u => u.Name).First()).FirstAsync(ct);
        var previews = rows.AsEnumerable().Reverse().Select(m => $"{m.author}: {Preview(m.Body, m.hasTask, m.fileCount, m.hasGif)}").ToArray();
        return new(rows[0].noticeId, roomId, uid, title, count, rows[0].Sequence, previews, rows[0].CreatedAt);
    }
    private static string Preview(string body, bool task, int files, bool gif)
    {
        var text = body.Length > 0 ? ChatGif.Preview(body).Replace('\r', ' ').Replace('\n', ' ') : task ? "Pendiente compartido" : gif ? files == 1 ? "GIF adjunto" : $"GIF y {files - 1} archivo(s) adjunto(s)" : files == 1 ? "Archivo adjunto" : $"{files} archivos adjuntos";
        return string.Concat(text.EnumerateRunes().Take(140).Select(r => r.ToString())) + (text.EnumerateRunes().Count() > 140 ? "…" : "");
    }
    public record ChatNotice(Guid Id, Guid RoomId, Guid UserId, string Title, int Count, long Sequence, string[] Previews, DateTime CreatedAt)
    {
        public string Tag => $"aegitasks-chat-{UserId:N}-{RoomId:N}";
        public string Body => (Count > 1 ? $"{Count} mensajes nuevos\n" : "") + string.Join('\n', Previews);
        public string Url => $"/#chat/{RoomId}";
    }
}
