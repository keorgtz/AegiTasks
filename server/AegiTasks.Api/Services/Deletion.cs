using System.Text.Json;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public static class Deletion
{
    // Caller owns the transaction. Notes survive; only their deleted links are cleared.
    public record RemovedContent(Guid[] Files, Guid[] FocusUsers);
    public static async Task<RemovedContent> RemoveTasks(AppDb db, List<WorkItem> tasks, Guid? projectId = null, Guid? actorId = null)
    {
        var ids = tasks.Select(t => t.Id).ToArray();
        foreach (var child in await db.Tasks.Where(t => t.ParentTaskId != null && ids.Contains(t.ParentTaskId.Value)).ToListAsync()) {
            child.ParentTaskId = null; child.Version = Guid.NewGuid(); child.UpdatedAt = DateTime.UtcNow;
            if (!ids.Contains(child.Id)) Rules.Log(db, child.Id, actorId ?? child.CreatedById, "Su padre fue eliminado; este pendiente se conserva sin padre.");
        }
        await db.SaveChangesAsync(); // Clear self-references before deleting any level of the tree.
        var attachments = await db.Attachments.Where(a => ids.Contains(a.WorkItemId)).Select(a => a.Id).ToArrayAsync();
        foreach (var note in await db.Notes.Where(n => (projectId != null && n.ProjectId == projectId) || (n.LinkedTaskId != null && ids.Contains(n.LinkedTaskId.Value))).ToListAsync())
        {
            if (projectId != null && note.ProjectId == projectId) note.ProjectId = null;
            if (note.LinkedTaskId != null && ids.Contains(note.LinkedTaskId.Value)) note.LinkedTaskId = null;
            note.Version = Guid.NewGuid(); note.UpdatedAt = DateTime.UtcNow;
        }
        var focusUsers = new HashSet<Guid>();
        foreach (var session in await db.FocusSessions.Where(s => s.SpaceId == db.CurrentSpaceId).ToListAsync())
        {
            var previous = JsonSerializer.Deserialize<Guid[]>(session.TaskIdsJson) ?? [];
            var kept = previous.Except(ids).ToArray();
            if (kept.Length == previous.Length) continue;
            session.TaskIdsJson = JsonSerializer.Serialize(kept); session.Version = Guid.NewGuid();
            focusUsers.Add(session.UserId);
        }
        db.Tasks.RemoveRange(tasks);
        await db.SaveChangesAsync();
        return new RemovedContent(attachments, focusUsers.ToArray());
    }
    public static void RemoveFiles(Guid[] ids, IConfiguration config, ILogger logger)
    {
        var directory = Path.GetFullPath(config["StoragePath"] ?? "uploads");
        foreach (var id in ids)
        {
            try { File.Delete(Path.Combine(directory, id.ToString("N"))); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { logger.LogWarning(e, "Could not remove orphaned attachment {Id}", id); }
        }
    }
}
