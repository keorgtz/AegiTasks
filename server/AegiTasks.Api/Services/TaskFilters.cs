using AegiTasks.Api.Domain;

namespace AegiTasks.Api.Services;

public static class TaskFilters
{
    public static IQueryable<WorkItem> ForAssignee(this IQueryable<WorkItem> query, string? assignee, Guid userId) => assignee switch
    {
        null or "" or "all" => query,
        "mine-or-unassigned" => query.Where(t => t.AssigneeId == userId || t.AssigneeId == null),
        "mine" => query.Where(t => t.AssigneeId == userId),
        "unassigned" => query.Where(t => t.AssigneeId == null),
        _ when Guid.TryParse(assignee, out var id) => query.Where(t => t.AssigneeId == id),
        _ => throw new InputError("Selecciona un responsable válido.")
    };
}
