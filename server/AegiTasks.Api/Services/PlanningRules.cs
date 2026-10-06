using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public static class PlanningRules
{
    public static readonly int[] Fibonacci = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    public static readonly string[] Categories = ["XS", "S", "M", "L", "XL"];
    public static string Kind(string value) => new[] { "none", "time", "points", "fibonacci", "linear", "categories" }.Contains(value) ? value : throw new InputError("Sistema de estimación no válido.");
    public static void Dates(DateOnly? starts, DateOnly? ends)
    {
        if (starts != null && ends != null && starts > ends) throw new InputError("La fecha final no puede ser anterior a la inicial.");
    }
    public static async Task Apply(AppDb db, WorkItem item, TaskPlanningInput? planning, Guid project, int? minutes, bool projectChanged)
    {
        if (planning == null) {
            // Old PWA clients preserve the new planning fields when editing the same project.
            if (projectChanged) { item.ModuleId = null; item.CycleId = null; }
            if (item.EstimateKind == "time") item.EstimateMinutes = minutes;
            return;
        }
        if (planning.ModuleId != null && !await db.Modules.AnyAsync(m => m.Id == planning.ModuleId && m.ProjectId == project)) throw new InputError("El módulo no pertenece al proyecto.");
        if (planning.CycleId != null && !await db.Cycles.AnyAsync(m => m.Id == planning.CycleId && m.ProjectId == project)) throw new InputError("El ciclo no pertenece al proyecto.");
        var kind = Kind(planning.EstimateKind);
        if (kind is "points" or "fibonacci" or "linear") {
            if (planning.EstimatePoints is < 0 or > 1000) throw new InputError("Los puntos deben ser de 0 a 1000.");
            if (planning.EstimatePoints != null && kind == "fibonacci" && !Fibonacci.Contains(planning.EstimatePoints.Value)) throw new InputError("Selecciona un valor Fibonacci válido.");
            if (planning.EstimatePoints != null && kind == "linear" && planning.EstimatePoints > 10) throw new InputError("La escala lineal va de 0 a 10.");
        }
        if (kind == "categories" && planning.EstimateCategory != null && !Categories.Contains(planning.EstimateCategory)) throw new InputError("Categoría de estimación no válida.");
        item.ModuleId = planning.ModuleId; item.CycleId = planning.CycleId; item.EstimateKind = kind;
        item.EstimateMinutes = kind == "time" ? minutes : null;
        item.EstimatePoints = kind is "points" or "fibonacci" or "linear" ? planning.EstimatePoints : null;
        item.EstimateCategory = kind == "categories" ? planning.EstimateCategory : null;
    }
}
