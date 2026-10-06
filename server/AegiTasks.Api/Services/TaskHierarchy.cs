using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public static class TaskHierarchy
{
    // Caller owns the transaction. Serialize topology writes so A->B and B->A
    // cannot both validate against the same snapshot on separate connections.
    public static async Task LockProjects(AppDb db, params Guid[] ids)
    {
        if (!db.Database.IsNpgsql()) return; // SQLite transactions acquire the writer lock.
        foreach (var id in ids.Distinct().Order())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT \"Id\" FROM \"Projects\" WHERE \"Id\" = {id} FOR UPDATE");
    }
    public static async Task Apply(AppDb db, WorkItem item, TaskHierarchyInput? input, Guid projectId)
    {
        var moved = item.ProjectId != projectId;
        if (moved && await db.Tasks.AnyAsync(t => t.ParentTaskId == item.Id))
            throw new InputError("Retira los subpendientes antes de cambiar este pendiente de proyecto.");
        var parentId = input is null ? (moved ? null : item.ParentTaskId) : input.ParentTaskId;
        if (parentId == item.Id) throw new InputError("Un pendiente no puede ser su propio padre.");
        if (parentId is null) { item.ParentTaskId = null; return; }
        if (!moved && parentId == item.ParentTaskId) return;
        var links = await db.Tasks.AsNoTracking().Where(t => t.ProjectId == projectId)
            .Select(t => new { t.Id, t.ParentTaskId, t.Archived }).ToDictionaryAsync(t => t.Id);
        if (!links.TryGetValue(parentId.Value, out var parent) || parent.Archived)
            throw new InputError("Selecciona un padre sin archivar del mismo proyecto y espacio.");
        var visited = new HashSet<Guid> { item.Id };
        Guid? cursor = parentId;
        while (cursor != null)
        {
            if (!visited.Add(cursor.Value)) throw new InputError("La relación crearía un ciclo entre pendientes.");
            cursor = links.TryGetValue(cursor.Value, out var link) ? link.ParentTaskId : null;
        }
        item.ParentTaskId = parentId;
    }
}
