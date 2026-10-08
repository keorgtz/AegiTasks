using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public static class ReminderAccess
{
    public static IQueryable<Reminder> ForRecipient(AppDb db, Guid userId) => db.Reminders.IgnoreQueryFilters().Where(r =>
        Access.SpacesFor(db, userId).Any(s => s.Id == r.SpaceId) &&
        db.Users.Any(u => u.Id == userId && u.Active && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "reminders" && p.Allowed))) &&
        (r.Audience != "user" || r.RecipientId == userId) &&
        (r.Audience != "project" || db.Users.Any(u => u.Id == userId && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "projects" && p.Allowed)))) &&
        (r.ProjectId == null || db.Projects.IgnoreQueryFilters().Any(p => p.Id == r.ProjectId && p.SpaceId == r.SpaceId)) &&
        (r.WorkItemId == null || db.Tasks.IgnoreQueryFilters().Any(t => t.Id == r.WorkItemId &&
            db.Projects.IgnoreQueryFilters().Any(p => p.Id == t.ProjectId && p.SpaceId == r.SpaceId) &&
            db.Users.Any(u => u.Id == userId && (u.Role == "Admin" || db.PagePermissions.Any(p => p.RoleName == u.Role && p.Page == "tasks" && p.Allowed))) &&
            (r.Audience != "assignee" || t.AssigneeId == null || t.AssigneeId == userId))));
    public static IQueryable<Reminder> Runnable(AppDb db) => db.Reminders.IgnoreQueryFilters().Where(r => r.Enabled &&
        (r.ProjectId == null || db.Projects.IgnoreQueryFilters().Any(p => p.Id == r.ProjectId && p.SpaceId == r.SpaceId && !p.Archived)) &&
        (r.WorkItemId == null || db.Tasks.IgnoreQueryFilters().Any(t => t.Id == r.WorkItemId && !t.Archived &&
            db.Projects.IgnoreQueryFilters().Any(p => p.Id == t.ProjectId && p.SpaceId == r.SpaceId && !p.Archived) &&
            !db.Statuses.IgnoreQueryFilters().Any(s => s.Id == t.StatusId && s.IsDone))));
    public static Task<bool> CanDeliver(AppDb db, Guid reminderId, Guid userId, CancellationToken ct) =>
        ForRecipient(db, userId).AnyAsync(r => r.Id == reminderId && Runnable(db).Any(a => a.Id == r.Id), ct);
    public static string Url(TaskNotification notice) => notice.WorkItemId != null
        ? $"/?space={notice.SpaceId}&task={notice.WorkItemId}#inbox"
        : $"/?space={notice.SpaceId}#reminders/{notice.ReminderId}";
}
