using System.Security.Claims;
using System.Text.RegularExpressions;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Services;

public class InputError(string message) : Exception(message);
public static class Rules
{
    public static string Text(string? value, int max, string label, bool required = true)
    {
        var text = value?.Trim() ?? "";
        if ((required && text.Length == 0) || text.Length > max) throw new InputError($"{label}: {(required ? "entre 1 y" : "máximo")} {max} caracteres.");
        return text;
    }
    public static string Color(string value) => new[] { "purple", "pink", "green", "blue", "orange", "red" }.Contains(value) ? value : throw new InputError("Color no válido.");
    public static Guid UserId(this ClaimsPrincipal user) => Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static object PublicUser(User u) => new { u.Id, u.Name, u.Username, u.Email, u.Role, u.Active };
    public static string Username(string? value)
    {
        var username = Text(value, 40, "Nombre de usuario").ToLowerInvariant();
        if (!Regex.IsMatch(username, @"\A[a-z0-9][a-z0-9._-]{2,39}\z"))
            throw new InputError("Nombre de usuario: de 3 a 40 caracteres; letras sin acentos, números, puntos, guiones o guiones bajos. Debe comenzar con una letra o número.");
        return username;
    }
    public static string DefaultUsername(string email, ISet<string> used)
    {
        var stem = Regex.Replace(email.Split('@')[0].ToLowerInvariant(), "[^a-z0-9._-]+", "-").Trim('.', '-', '_');
        stem = stem[..Math.Min(stem.Length, 32)];
        if (stem.Length < 3) stem = "user";
        var candidate = stem;
        for (var suffix = 2; used.Contains(candidate); suffix++) candidate = $"{stem}-{suffix}";
        used.Add(candidate);
        return candidate;
    }
    public static void Password(string? value)
    {
        if (value is null || value.Length < 12 || value.Length > 128) throw new InputError("La contraseña debe tener entre 12 y 128 caracteres.");
    }
    public static void Log(AppDb db, Guid item, Guid user, string body, string kind = "system") => db.Activities.Add(new Activity { WorkItemId = item, UserId = user, Body = body, Kind = kind });
    public static async Task ApplyTask(AppDb db, WorkItem item, TaskInput input)
    {
        var projectChanged = item.ProjectId != input.ProjectId;
        item.Title = Text(input.Title, 200, "Título");
        item.Description = Text(input.Description, 12000, "Descripción", false);
        if (!await db.Projects.AnyAsync(x => x.Id == input.ProjectId && !x.Archived)) throw new InputError("Selecciona un proyecto activo.");
        if (!await db.Statuses.AnyAsync(x => x.Id == input.StatusId && x.ProjectId == input.ProjectId)) throw new InputError("El estado no pertenece al proyecto.");
        if (input.FolderId != null && !await db.Folders.AnyAsync(x => x.Id == input.FolderId && x.ProjectId == input.ProjectId)) throw new InputError("La carpeta no pertenece al proyecto.");
        if (input.AssigneeId != null && !await Access.Members(db, db.CurrentSpaceId).AnyAsync(x => x.Id == input.AssigneeId && x.Active)) throw new InputError("El responsable no pertenece al espacio o no está activo.");
        if (input.Priority is < 1 or > 4) throw new InputError("Prioridad no válida.");
        if (input.EstimateMinutes is < 1 or > 600000) throw new InputError("La estimación debe ser de 1 a 600000 minutos.");
        await PlanningRules.Apply(db, item, input.Planning, input.ProjectId, input.EstimateMinutes, projectChanged);
        var ids = (input.TagIds ?? []).Distinct().ToArray();
        var tags = await db.Tags.Where(x => ids.Contains(x.Id)).ToListAsync();
        if (tags.Count != ids.Length || ids.Length > 20) throw new InputError("Etiquetas no válidas (máximo 20).");
        item.ProjectId = input.ProjectId; item.FolderId = input.FolderId; item.StatusId = input.StatusId;
        item.AssigneeId = input.AssigneeId; item.Priority = input.Priority; item.DueDate = input.DueDate;
        item.Tags = tags;
    }
}
public record TaskInput(string Title, string? Description, Guid ProjectId, Guid StatusId, Guid? FolderId, Guid? AssigneeId, int? Priority, DateOnly? DueDate, int? EstimateMinutes, Guid[]? TagIds, Guid? Version, TaskPlanningInput? Planning = null);
public record TaskPlanningInput(Guid? ModuleId, Guid? CycleId, string EstimateKind, int? EstimatePoints, string? EstimateCategory);
