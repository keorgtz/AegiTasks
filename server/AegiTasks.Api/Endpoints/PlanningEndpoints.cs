using System.Security.Claims;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class PlanningEndpoints
{
    public static void MapPlanning(this WebApplication app)
    {
        MapGroups(app, true); MapGroups(app, false);
        app.MapGet("/api/projects/{id:guid}/planning", async (Guid id, AppDb db) => {
            if (!await db.Projects.AnyAsync(p => p.Id == id)) return Results.NotFound();
            var tasks = await db.Tasks.AsNoTracking().Where(t => t.ProjectId == id && !t.Archived)
                .Select(t => new ProgressTask(t.ModuleId, t.CycleId, db.Statuses.Any(s => s.Id == t.StatusId && s.IsDone), t.EstimateKind, t.EstimatePoints, t.EstimateMinutes, t.EstimateCategory)).ToListAsync();
            var modules = await db.Modules.AsNoTracking().Where(m => m.ProjectId == id).OrderBy(m => m.Name).ToListAsync();
            var cycles = await db.Cycles.AsNoTracking().Where(m => m.ProjectId == id).OrderBy(m => m.StartsOn == null).ThenBy(m => m.StartsOn).ThenBy(m => m.Name).ToListAsync();
            return Results.Ok(new {
                project = Progress(tasks),
                ungrouped = Progress(tasks.Where(t => t.ModuleId == null)),
                modules = modules.Select(m => new { group = m, progress = Progress(tasks.Where(t => t.ModuleId == m.Id)) }),
                cycles = cycles.Select(m => new { group = m, progress = Progress(tasks.Where(t => t.CycleId == m.Id)) })
            });
        }).RequireAuthorization("page:projects");
    }
    private static void MapGroups(WebApplication app, bool module)
    {
        var routes = app.MapGroup(module ? "/api/modules" : "/api/cycles").RequireAuthorization("page:projects");
        async Task<IProjectGroup?> Find(AppDb db, Guid id) => module
            ? await db.Modules.SingleOrDefaultAsync(m => m.Id == id)
            : await db.Cycles.SingleOrDefaultAsync(m => m.Id == id);
        routes.MapPost("/", async (GroupInput input, AppDb db) => {
            if (!await db.Projects.AnyAsync(p => p.Id == input.ProjectId && !p.Archived)) throw new InputError("Selecciona un proyecto activo.");
            IProjectGroup group = module ? new ProjectModule() : new ProjectCycle();
            group.ProjectId = input.ProjectId; Apply(group, input); db.Add(group);
            await db.SaveChangesAsync(); return Results.Ok(group);
        });
        routes.MapPut("/{id:guid}", async (Guid id, GroupInput input, AppDb db) => {
            var group = await Find(db, id); if (group == null) return Results.NotFound();
            if (input.ProjectId != group.ProjectId) throw new InputError("La agrupación conserva su proyecto.");
            Apply(group, input); await db.SaveChangesAsync(); return Results.Ok(group);
        });
        routes.MapDelete("/{id:guid}", async (Guid id, AppDb db, ClaimsPrincipal user) => {
            var group = await Find(db, id); if (group == null) return Results.NotFound();
            await using var transaction = await db.Database.BeginTransactionAsync();
            var tasks = await db.Tasks.Where(t => module ? t.ModuleId == id : t.CycleId == id).ToListAsync();
            if (tasks.Count > 0 && !await Access.Can(db, user, "tasks")) return Results.Forbid();
            foreach (var task in tasks) {
                if (module) task.ModuleId = null; else task.CycleId = null;
                task.Version = Guid.NewGuid(); task.UpdatedAt = DateTime.UtcNow;
                Rules.Log(db, task.Id, user.UserId(), $"Se eliminó {(module ? "el módulo" : "el ciclo")} «{group.Name}». El pendiente se conserva.");
            }
            await db.SaveChangesAsync(); db.Remove(group); await db.SaveChangesAsync();
            await transaction.CommitAsync(); return Results.NoContent();
        });
        routes.MapPost("/{id:guid}/tasks", async (Guid id, AssignmentInput input, AppDb db, ClaimsPrincipal user) => {
            var group = await Find(db, id); if (group == null) return Results.NotFound();
            if (!await db.Projects.AnyAsync(p => p.Id == group.ProjectId && !p.Archived)) throw new InputError("Restaura el proyecto antes de planificar.");
            if (input.Tasks == null || input.Tasks.Length is < 1 or > 5000 || input.Tasks.Select(t => t.Id).Distinct().Count() != input.Tasks.Length) throw new InputError("Selecciona de 1 a 5000 pendientes diferentes.");
            await using var transaction = await db.Database.BeginTransactionAsync();
            var ids = input.Tasks.Select(t => t.Id).ToArray();
            var tasks = await db.Tasks.Where(t => ids.Contains(t.Id) && t.ProjectId == group.ProjectId && !t.Archived).ToListAsync();
            if (tasks.Count != ids.Length) throw new InputError("Todos los pendientes deben pertenecer a este proyecto y estar sin archivar.");
            if (input.Remove && tasks.Any(t => module ? t.ModuleId != id : t.CycleId != id)) throw new InputError("Solo puedes retirar pendientes de esta agrupación.");
            var versions = input.Tasks.ToDictionary(t => t.Id, t => t.Version);
            if (tasks.Any(t => t.Version != versions[t.Id])) return Results.Conflict(new { error = "Uno de los pendientes cambió. Cierra y vuelve a abrir la selección antes de guardar." });
            foreach (var task in tasks) {
                if (module) task.ModuleId = input.Remove ? null : id; else task.CycleId = input.Remove ? null : id;
                task.Version = Guid.NewGuid(); task.UpdatedAt = DateTime.UtcNow;
                Rules.Log(db, task.Id, user.UserId(), input.Remove ? $"Retiró el pendiente de {(module ? "su módulo" : "su ciclo")}." : $"Asignó {(module ? "el módulo" : "el ciclo")} «{group.Name}».");
            }
            await db.SaveChangesAsync(); await transaction.CommitAsync(); return Results.NoContent();
        }).RequireAuthorization("page:tasks");
    }
    private static void Apply(IProjectGroup group, GroupInput input)
    {
        group.Name = Rules.Text(input.Name, 80, "Nombre"); group.Description = Rules.Text(input.Description, 1000, "Descripción", false);
        group.Color = Rules.Color(input.Color); PlanningRules.Dates(input.StartsOn, input.EndsOn);
        group.StartsOn = input.StartsOn; group.EndsOn = input.EndsOn;
    }
    private record ProgressTask(Guid? ModuleId, Guid? CycleId, bool Done, string Kind, int? Points, int? Minutes, string? Category);
    private static object Progress(IEnumerable<ProgressTask> items)
    {
        var tasks = items.ToArray(); var done = tasks.Count(t => t.Done);
        var estimates = tasks.Where(t => t.Points != null || t.Minutes != null).GroupBy(t => t.Kind).Select(g => {
            var total = g.Sum(t => (long)(t.Kind == "time" ? t.Minutes ?? 0 : t.Points ?? 0));
            var completed = g.Where(t => t.Done).Sum(t => (long)(t.Kind == "time" ? t.Minutes ?? 0 : t.Points ?? 0));
            return new { kind = g.Key, total, completed, estimatedTasks = g.Count(), percent = total == 0 ? (double?)null : Math.Round(100d * completed / total, 1) };
        }).ToArray();
        return new { total = tasks.Length, done, percent = tasks.Length == 0 ? 0 : Math.Round(100d * done / tasks.Length, 1), unestimated = tasks.Count(t => t.Points == null && t.Minutes == null && t.Category == null), estimates,
            categories = PlanningRules.Categories.Select(c => new { category = c, total = tasks.Count(t => t.Category == c), done = tasks.Count(t => t.Category == c && t.Done) }) };
    }
    public record GroupInput(Guid ProjectId, string Name, string? Description, string Color = "purple", DateOnly? StartsOn = null, DateOnly? EndsOn = null);
    public record AssignmentTask(Guid Id, Guid Version);
    public record AssignmentInput(AssignmentTask[]? Tasks, bool Remove = false);
}
