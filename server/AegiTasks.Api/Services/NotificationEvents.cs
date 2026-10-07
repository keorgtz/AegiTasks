using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public static class NotificationEvents
{
    public static async Task Stage(AppDb db, SpaceScope scope, CancellationToken ct)
    {
        if (scope.UserId == Guid.Empty) return;
        db.ChangeTracker.DetectChanges();
        var tasks = db.ChangeTracker.Entries<WorkItem>().Where(e => e.State is EntityState.Added or EntityState.Modified).ToArray();
        var comments = db.ChangeTracker.Entries<Activity>().Where(e => e.State == EntityState.Added && e.Entity.Kind == "comment").Select(e => e.Entity.WorkItemId).ToArray();
        var attachments = db.ChangeTracker.Entries<Attachment>().Where(e => e.State == EntityState.Added).Select(e => e.Entity.WorkItemId).ToArray();
        if (tasks.Length + comments.Length + attachments.Length == 0) return;
        var actor = await db.Users.Where(u => u.Id == scope.UserId).Select(u => u.Name).SingleAsync(ct);
        var events = tasks.Select(e => (Task: e.Entity, Kind: e.State == EntityState.Added ? "created" : "updated")).ToList();
        foreach (var (ids, kind) in new[] { (comments, "comment"), (attachments, "evidence") })
            foreach (var id in ids.Distinct())
            {
                var task = db.Tasks.Local.FirstOrDefault(t => t.Id == id) ?? await db.Tasks.SingleAsync(t => t.Id == id, ct);
                events.Add((task, kind));
            }
        foreach (var (task, kind) in events.DistinctBy(e => (e.Task.Id, e.Kind)))
        {
            var space = await db.Projects.Where(p => p.Id == task.ProjectId).Select(p => p.SpaceId).SingleAsync(ct);
            var members = Access.Members(db, space).Where(u => u.Active &&
                (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "tasks" && p.Allowed)));
            if (task.AssigneeId != null) members = members.Where(u => u.Id == task.AssigneeId && u.Id != scope.UserId);
            var recipients = await members.Select(u => u.Id).ToListAsync(ct);
            var action = kind switch { "created" => "creó un pendiente", "comment" => "comentó un pendiente", "evidence" => "agregó evidencia a un pendiente", _ => "actualizó un pendiente" };
            foreach (var recipient in recipients)
            {
                var audience = task.AssigneeId == null ? " sin responsable" : " asignado a ti";
                var notification = new TaskNotification { UserId = recipient, SpaceId = space, WorkItemId = task.Id, Kind = kind, Message = $"{actor} {action}{audience}." };
                db.Notifications.Add(notification);
                var devices = await db.PushDevices.Where(d => d.UserId == recipient && db.Users.Any(u => u.Id == recipient && u.SessionVersion == d.SessionVersion)).Select(d => d.Id).ToListAsync(ct);
                foreach (var device in devices) db.PushDeliveries.Add(new PushDelivery { NotificationId = notification.Id, DeviceId = device });
                scope.NotificationUsers.Add(recipient);
            }
        }
    }

    // Recheck membership, page permissions and project moves whenever reading or delivering.
    public static IQueryable<TaskNotification> Visible(AppDb db, Guid userId) => db.Notifications.Where(n => n.UserId == userId &&
        db.Users.Any(u => u.Id == userId && u.Active && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "tasks" && p.Allowed))) &&
        Access.SpacesFor(db, userId).Any(s => s.Id == n.SpaceId) &&
        db.Tasks.IgnoreQueryFilters().Any(t => t.Id == n.WorkItemId && db.Projects.IgnoreQueryFilters().Any(p => p.Id == t.ProjectId && p.SpaceId == n.SpaceId)));
}
