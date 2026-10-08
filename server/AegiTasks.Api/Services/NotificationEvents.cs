using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace AegiTasks.Api.Services;

public static class NotificationEvents
{
    public static async Task Stage(AppDb db, SpaceScope scope, CancellationToken ct)
    {
        if (scope.UserId == Guid.Empty) return;
        db.ChangeTracker.DetectChanges();
        var tagChanges = db.ChangeTracker.Entries().Where(e => e.Metadata.Name == "WorkItemTags" && e.State is EntityState.Added or EntityState.Deleted)
            .Select(e => (Guid)e.Property("WorkItemId").CurrentValue!).ToHashSet();
        var tasks = db.ChangeTracker.Entries<WorkItem>().Where(e => e.State is EntityState.Added or EntityState.Modified || tagChanges.Contains(e.Entity.Id) && e.State == EntityState.Unchanged).ToArray();
        var comments = db.ChangeTracker.Entries<Activity>().Where(e => e.State == EntityState.Added && e.Entity.Kind == "comment").Select(e => e.Entity.WorkItemId).ToArray();
        var attachments = db.ChangeTracker.Entries<Attachment>().Where(e => e.State == EntityState.Added).Select(e => e.Entity.WorkItemId).ToArray();
        if (tasks.Length + comments.Length + attachments.Length == 0) return;
        var actor = await db.Users.Where(u => u.Id == scope.UserId).Select(u => u.Name).SingleAsync(ct);
        var events = new List<(WorkItem Task, string Kind, string Action)>();
        foreach (var entry in tasks)
        {
            if (entry.State == EntityState.Added) events.Add((entry.Entity, "created", "creó un pendiente"));
            else
            {
                var action = await DescribeChanges(db, entry, tagChanges.Contains(entry.Entity.Id), ct);
                if (action.Length > 0) events.Add((entry.Entity, "updated", action));
            }
        }
        foreach (var (ids, kind) in new[] { (comments, "comment"), (attachments, "evidence") })
            foreach (var id in ids.Distinct())
            {
                var task = db.Tasks.Local.FirstOrDefault(t => t.Id == id) ?? await db.Tasks.SingleAsync(t => t.Id == id, ct);
                events.Add((task, kind, kind == "comment" ? "comentó el pendiente" : "agregó evidencia al pendiente"));
            }
        foreach (var (task, kind, action) in events.DistinctBy(e => (e.Task.Id, e.Kind)))
        {
            var space = await db.Projects.Where(p => p.Id == task.ProjectId).Select(p => p.SpaceId).SingleAsync(ct);
            var members = Access.Members(db, space).Where(u => u.Active &&
                (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "tasks" && p.Allowed)));
            if (task.AssigneeId != null) members = members.Where(u => u.Id == task.AssigneeId && u.Id != scope.UserId);
            var recipients = await members.Select(u => u.Id).ToListAsync(ct);
            foreach (var recipient in recipients)
            {
                var audience = kind == "created" ? task.AssigneeId == null ? " sin responsable" : " asignado a ti" : "";
                var notification = new TaskNotification { UserId = recipient, SpaceId = space, WorkItemId = task.Id, Kind = kind, TaskTitle = task.Title, Message = $"{actor} {action}{audience}." };
                db.Notifications.Add(notification);
                var devices = await db.PushDevices.Where(d => d.UserId == recipient && db.Users.Any(u => u.Id == recipient && u.SessionVersion == d.SessionVersion)).Select(d => d.Id).ToListAsync(ct);
                foreach (var device in devices) db.PushDeliveries.Add(new PushDelivery { NotificationId = notification.Id, DeviceId = device });
                scope.NotificationUsers.Add(recipient);
            }
        }
    }

    private static async Task<string> DescribeChanges(AppDb db, EntityEntry<WorkItem> entry, bool tagsChanged, CancellationToken ct)
    {
        bool Changed(string property) => !Equals(entry.Property(property).OriginalValue, entry.Property(property).CurrentValue);
        var actions = new List<string>();
        if (Changed(nameof(WorkItem.AssigneeId))) actions.Add(entry.Entity.AssigneeId == null ? "dejó el pendiente sin responsable" : "te asignó el pendiente");
        if (Changed(nameof(WorkItem.StatusId)))
        {
            var status = await db.Statuses.FindAsync([entry.Entity.StatusId], ct);
            actions.Add($"cambió el estado a «{status?.Name ?? "otro estado"}»");
        }
        if (Changed(nameof(WorkItem.Archived))) actions.Add(entry.Entity.Archived ? "archivó el pendiente" : "restauró el pendiente");
        var fields = new List<string>();
        foreach (var (property, label) in new[] {
            (nameof(WorkItem.Title), "título"), (nameof(WorkItem.Description), "descripción"),
            (nameof(WorkItem.ProjectId), "proyecto"), (nameof(WorkItem.FolderId), "carpeta"),
            (nameof(WorkItem.ModuleId), "módulo"), (nameof(WorkItem.CycleId), "ciclo"),
            (nameof(WorkItem.ParentTaskId), "pendiente padre"), (nameof(WorkItem.Priority), "prioridad"),
            (nameof(WorkItem.DueDate), "fecha límite") })
            if (Changed(property)) fields.Add(label);
        if (new[] { nameof(WorkItem.EstimateMinutes), nameof(WorkItem.EstimateKind), nameof(WorkItem.EstimatePoints), nameof(WorkItem.EstimateCategory) }.Any(Changed)) fields.Add("estimación");
        if (tagsChanged) fields.Add("etiquetas");
        if (fields.Count > 0) actions.Add($"actualizó: {string.Join(", ", fields)}");
        // Version/timestamps alone are bookkeeping, not changes the recipient needs to act on.
        return string.Join("; ", actions);
    }

    // Recheck membership, page permissions and project moves whenever reading or delivering.
    public static IQueryable<TaskNotification> Visible(AppDb db, Guid userId) => db.Notifications.Where(n => n.UserId == userId &&
        Access.SpacesFor(db, userId).Any(s => s.Id == n.SpaceId) &&
        (n.ReminderId != null
            ? ReminderAccess.ForRecipient(db, userId).Any(r => r.Id == n.ReminderId && r.SpaceId == n.SpaceId && r.WorkItemId == n.WorkItemId)
            : db.Users.Any(u => u.Id == userId && u.Active && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "tasks" && p.Allowed))) &&
              db.Tasks.IgnoreQueryFilters().Any(t => t.Id == n.WorkItemId && db.Projects.IgnoreQueryFilters().Any(p => p.Id == t.ProjectId && p.SpaceId == n.SpaceId))));
}
