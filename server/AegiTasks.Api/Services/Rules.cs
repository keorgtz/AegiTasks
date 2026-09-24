using System.Security.Claims;
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
    public static object PublicUser(User u) => new { u.Id, u.Name, u.Email, u.Role, u.Active };
    public static void Password(string? value)
    {
        if (value is null || value.Length < 12 || value.Length > 128) throw new InputError("La contraseña debe tener entre 12 y 128 caracteres.");
    }
    public static void Log(AppDb db, Guid item, Guid user, string body, string kind = "system") => db.Activities.Add(new Activity { WorkItemId = item, UserId = user, Body = body, Kind = kind });
    public static async Task ApplyTask(AppDb db, WorkItem item, TaskInput input)
    {
        item.Title = Text(input.Title, 200, "Título");
        item.Description = Text(input.Description, 12000, "Descripción", false);
        if (!await db.Projects.AnyAsync(x => x.Id == input.ProjectId && !x.Archived)) throw new InputError("Selecciona un proyecto activo.");
        if (!await db.Statuses.AnyAsync(x => x.Id == input.StatusId && x.ProjectId == input.ProjectId)) throw new InputError("El estado no pertenece al proyecto.");
        if (input.FolderId != null && !await db.Folders.AnyAsync(x => x.Id == input.FolderId && x.ProjectId == input.ProjectId)) throw new InputError("La carpeta no pertenece al proyecto.");
        if (input.AssigneeId != null && !await Access.Members(db, db.CurrentSpaceId).AnyAsync(x => x.Id == input.AssigneeId && x.Active)) throw new InputError("El responsable no pertenece al espacio o no está activo.");
        if (input.Priority is < 1 or > 4) throw new InputError("Prioridad no válida.");
        if (input.EstimateMinutes is < 1 or > 600000) throw new InputError("La estimación debe ser de 1 a 600000 minutos.");
        var ids = (input.TagIds ?? []).Distinct().ToArray();
        var tags = await db.Tags.Where(x => ids.Contains(x.Id)).ToListAsync();
        if (tags.Count != ids.Length || ids.Length > 20) throw new InputError("Etiquetas no válidas (máximo 20).");
        item.ProjectId = input.ProjectId; item.FolderId = input.FolderId; item.StatusId = input.StatusId;
        item.AssigneeId = input.AssigneeId; item.Priority = input.Priority; item.DueDate = input.DueDate; item.EstimateMinutes = input.EstimateMinutes;
        item.Tags = tags;
    }
}
public record TaskInput(string Title, string? Description, Guid ProjectId, Guid StatusId, Guid? FolderId, Guid? AssigneeId, int? Priority, DateOnly? DueDate, int? EstimateMinutes, Guid[]? TagIds, Guid? Version);
