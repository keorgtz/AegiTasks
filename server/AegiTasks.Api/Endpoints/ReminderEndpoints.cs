using System.Security.Claims;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;

public static class ReminderEndpoints
{
    public record Input(string Title, string Message, Guid? ProjectId, Guid? WorkItemId, string Audience, Guid? RecipientId, ReminderSchedule Schedule, bool Enabled, Guid? Version);
    public static void MapReminders(this WebApplication app)
    {
        var group = app.MapGroup("/api/reminders").RequireAuthorization("page:reminders");
        group.MapGet("/", async (AppDb db, ClaimsPrincipal user, Guid? taskId, bool? linked, string? q, int? page) => {
            var query = db.Reminders.AsNoTracking();
            if (taskId != null) {
                if (!await Access.Can(db, user, "tasks")) return Results.Forbid();
                if (!await db.Tasks.AnyAsync(t => t.Id == taskId)) return Results.NotFound();
                query = query.Where(r => r.WorkItemId == taskId);
            }
            else if (!await Access.Can(db, user, "tasks")) query = query.Where(r => r.WorkItemId == null);
            if (linked != null) query = query.Where(r => (r.WorkItemId != null) == linked);
            if (!string.IsNullOrWhiteSpace(q)) { var search = q.Trim().ToLowerInvariant(); query = query.Where(r => r.Title.ToLower().Contains(search) || r.Message.ToLower().Contains(search) || db.Tasks.Any(t => t.Id == r.WorkItemId && t.Title.ToLower().Contains(search))); }
            var number = Math.Clamp(page ?? 1, 1, 100000);
            var items = await query.OrderByDescending(r => r.CreatedAt).ThenBy(r => r.Id).Skip((number - 1) * 30).Take(30).ToListAsync();
            var output = new List<object>();
            foreach (var r in items) output.Add(await Dto(db, r));
            return Results.Ok(new { items = output, total = await query.CountAsync(), page = number, pageSize = 30 });
        });
        group.MapGet("/{id:guid}", async (Guid id, AppDb db, ClaimsPrincipal user) => {
            var r = await db.Reminders.AsNoTracking().SingleOrDefaultAsync(r => r.Id == id);
            if (r == null) return Results.NotFound();
            if (r.WorkItemId != null && !await Access.Can(db, user, "tasks")) return Results.Forbid();
            return Results.Ok(await Dto(db, r));
        });
        group.MapPost("/", async (Input input, AppDb db, SpaceScope space, ClaimsPrincipal user, TimeProvider clock) => {
            var r = new Reminder { SpaceId = space.SpaceId, CreatedById = user.UserId() };
            await Apply(db, r, input, user, clock.GetUtcNow().UtcDateTime);
            db.Reminders.Add(r); await db.SaveChangesAsync();
            return Results.Ok(await Dto(db, r));
        });
        group.MapPut("/{id:guid}", async (Guid id, Input input, AppDb db, ClaimsPrincipal user, TimeProvider clock) => {
            var r = await db.Reminders.SingleOrDefaultAsync(r => r.Id == id);
            if (r == null) return Results.NotFound();
            if (input.Version != r.Version) return Results.Conflict(new { error = "Otra persona actualizó el recordatorio. Recarga antes de guardar." });
            await Apply(db, r, input, user, clock.GetUtcNow().UtcDateTime);
            await db.SaveChangesAsync(); return Results.Ok(await Dto(db, r));
        });
        group.MapDelete("/{id:guid}", async (Guid id, Guid version, AppDb db, ClaimsPrincipal user) => {
            var r = await db.Reminders.SingleOrDefaultAsync(r => r.Id == id);
            if (r == null) return Results.NotFound();
            if (r.WorkItemId != null && !await Access.Can(db, user, "tasks")) return Results.Forbid();
            if (r.Version != version) return Results.Conflict(new { error = "El recordatorio cambió. Recarga antes de eliminarlo." });
            db.Reminders.Remove(r); await db.SaveChangesAsync(); return Results.NoContent();
        });
    }
    private static async Task Apply(AppDb db, Reminder r, Input input, ClaimsPrincipal user, DateTime now)
    {
        if (input.Schedule == null) throw new InputError("Agrega la programación.");
        input.Schedule.Validate();
        if (db.Entry(r).State != EntityState.Detached && r.WorkItemId != input.WorkItemId) throw new InputError("No se puede cambiar el pendiente vinculado.");
        WorkItem? task = null;
        if (input.WorkItemId != null) {
            if (!await Access.Can(db, user, "tasks")) throw new InputError("No tienes permiso para pendientes.");
            task = await db.Tasks.SingleOrDefaultAsync(t => t.Id == input.WorkItemId) ?? throw new InputError("Pendiente no disponible en este espacio.");
            if (input.ProjectId != null) throw new InputError("El recordatorio ligado usa el proyecto del pendiente.");
        }
        if (input.ProjectId != null && !await db.Projects.AnyAsync(p => p.Id == input.ProjectId && (!p.Archived || r.ProjectId == input.ProjectId))) throw new InputError("Proyecto no disponible en este espacio.");
        if (input.Audience is not ("workspace" or "project" or "user" or "assignee") || input.Audience == "assignee" && task == null || input.Audience == "project" && task == null && input.ProjectId == null) throw new InputError("Destinatarios no válidos.");
        if (input.Audience == "user" && (input.RecipientId == null || !await Access.Members(db, db.CurrentSpaceId).AnyAsync(u => u.Id == input.RecipientId && u.Active) && !(!input.Enabled && db.Entry(r).State != EntityState.Detached && r.RecipientId == input.RecipientId))) throw new InputError("El destinatario debe ser miembro activo del espacio.");
        var title = task?.Title ?? (input.Title ?? "").Trim();
        if (title.Length is < 1 or > 200) throw new InputError("El título debe tener de 1 a 200 caracteres.");
        if ((input.Message?.Length ?? 0) > 2000) throw new InputError("El mensaje admite hasta 2000 caracteres.");
        var next = input.Schedule.Next(now.AddTicks(-1));
        if (input.Enabled && next == null && r.LastSentAt == null) throw new InputError("La fecha del aviso único debe ser futura.");
        r.Title = title; r.Message = (input.Message ?? "").Trim(); r.ProjectId = input.ProjectId; r.WorkItemId = input.WorkItemId;
        r.Audience = input.Audience; r.RecipientId = input.Audience == "user" ? input.RecipientId : null;
        r.ScheduleJson = input.Schedule.Serialize(); r.Enabled = input.Enabled; r.NextRunAt = input.Enabled ? next : null;
        r.Version = Guid.NewGuid(); r.UpdatedAt = now;
    }
    private static async Task<object> Dto(AppDb db, Reminder r)
    {
        var task = r.WorkItemId == null ? null : await db.Tasks.AsNoTracking().SingleOrDefaultAsync(t => t.Id == r.WorkItemId);
        var projectId = task?.ProjectId ?? r.ProjectId;
        var project = projectId == null ? null : await db.Projects.AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId);
        var completed = task != null && await db.Statuses.AnyAsync(s => s.Id == task.StatusId && s.IsDone);
        return new { r.Id, r.SpaceId, r.WorkItemId, projectId, title = task?.Title ?? r.Title, r.Message, r.Audience, r.RecipientId,
            schedule = ReminderSchedule.Parse(r.ScheduleJson), r.Enabled, r.NextRunAt, r.LastSentAt, r.CreatedAt, r.UpdatedAt, r.Version,
            suppressed = r.Enabled && (task?.Archived == true || project?.Archived == true || completed) };
    }
}
