using System.Security.Claims;
using System.Text.Json;
using AegiTasks.Api.Data;
using AegiTasks.Api.Domain;
using AegiTasks.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace AegiTasks.Api.Endpoints;
public static class FocusEndpoints
{
    public static void MapFocus(this WebApplication app)
    {
        var group = app.MapGroup("/api/focus").RequireAuthorization("page:focus");
        group.MapGet("/", async (AppDb db, ClaimsPrincipal user) => {
            var id = user.UserId();
            var profile = await db.FocusProfiles.AsNoTracking().SingleOrDefaultAsync(p => p.UserId == id) ?? new FocusProfile { UserId = id };
            var session = await db.FocusSessions.AsNoTracking().SingleOrDefaultAsync(s => s.UserId == id && s.FinishedAt == null);
            var history = await db.FocusSessions.AsNoTracking().Where(s => s.UserId == id && s.FinishedAt != null).OrderByDescending(s => s.StartedAt).Take(30).ToListAsync();
            return Results.Ok(new { profile, session, history, serverNow = DateTime.UtcNow });
        });
        group.MapPut("/profile", async (ProfileInput input, AppDb db, ClaimsPrincipal user) => {
            if (input.FocusMinutes is < 1 or > 240 || input.ShortBreakMinutes is < 1 or > 60 || input.LongBreakMinutes is < 1 or > 120 || input.Cycles is < 1 or > 12) throw new InputError("Revisa las duraciones: enfoque 1–240, pausa 1–60, pausa larga 1–120 y ciclos 1–12.");
            if (input.Theme is not ("aurora" or "waves" or "terminal")) throw new InputError("Tema no válido.");
            var p = await db.FocusProfiles.FindAsync(user.UserId()); if (p == null) { p = new FocusProfile { UserId = user.UserId() }; db.FocusProfiles.Add(p); }
            p.FocusMinutes = input.FocusMinutes; p.ShortBreakMinutes = input.ShortBreakMinutes; p.LongBreakMinutes = input.LongBreakMinutes; p.Cycles = input.Cycles; p.Theme = input.Theme; p.Animated = input.Animated; p.Sound = input.Sound;
            await db.SaveChangesAsync(); return Results.Ok(p);
        });
        group.MapGet("/{id:guid}/tasks", async (Guid id, AppDb db, ClaimsPrincipal user) => {
            var session = await db.FocusSessions.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id && s.UserId == user.UserId() && s.SpaceId == db.CurrentSpaceId);
            if (session == null) return Results.NotFound();
            var ids = JsonSerializer.Deserialize<Guid[]>(session.TaskIdsJson) ?? [];
            var tasks = new Dictionary<Guid, WorkItem>();
            foreach (var batch in ids.Chunk(500))
                foreach (var task in await db.Tasks.AsNoTracking().Include(t => t.Tags).Where(t => batch.Contains(t.Id)).ToListAsync())
                    tasks[task.Id] = task;
            return Results.Ok(ids.Where(tasks.ContainsKey).Select(id => tasks[id]));
        }).RequireAuthorization("page:tasks");
        group.MapPut("/{id:guid}/tasks", async (Guid id, TasksInput input, AppDb db, ClaimsPrincipal user) => {
            var session = await db.FocusSessions.SingleOrDefaultAsync(s => s.Id == id && s.UserId == user.UserId() && s.SpaceId == db.CurrentSpaceId && s.FinishedAt == null);
            if (session == null) return Results.NotFound();
            if (session.Version != input.Version) return Results.Conflict(new { error = "La sesión cambió. Revisa la selección y vuelve a guardar." });
            var ids = (input.TaskIds ?? []).Distinct().ToArray();
            var previous = (JsonSerializer.Deserialize<Guid[]>(session.TaskIdsJson) ?? []).ToHashSet();
            await ValidateTasks(db, user.UserId(), ids.Where(id => !previous.Contains(id)).ToArray());
            session.TaskIdsJson = JsonSerializer.Serialize(ids);
            session.Version = Guid.NewGuid();
            await db.SaveChangesAsync(); return Results.Ok(session);
        }).RequireAuthorization("page:tasks");
        group.MapPost("/start", async (StartInput input, AppDb db, ClaimsPrincipal user) => {
            var id = user.UserId(); if (await db.FocusSessions.AnyAsync(s => s.UserId == id && s.FinishedAt == null)) return Results.Conflict(new { error = "Ya tienes una sesión activa. Retómala o finalízala primero." });
            var ids = (input.TaskIds ?? []).Distinct().ToArray();
            if (ids.Length > 0 && !await Access.Can(db, user, "tasks")) return Results.Forbid();
            await ValidateTasks(db, id, ids);
            var p = await db.FocusProfiles.FindAsync(id) ?? new FocusProfile();
            var s = new FocusSession { UserId = id, SpaceId = db.CurrentSpaceId, Goal = Rules.Text(input.Goal, 2000, "Objetivos", false), TaskIdsJson = JsonSerializer.Serialize(ids), FocusMinutes = p.FocusMinutes, ShortBreakMinutes = p.ShortBreakMinutes, LongBreakMinutes = p.LongBreakMinutes, Cycles = p.Cycles, RemainingSeconds = p.FocusMinutes * 60, EndsAt = DateTime.UtcNow.AddMinutes(p.FocusMinutes) };
            db.FocusSessions.Add(s); await db.SaveChangesAsync(); return Results.Ok(s);
        });
        group.MapPost("/{id:guid}/action", async (Guid id, ActionInput input, AppDb db, ClaimsPrincipal user) => {
            var s = await db.FocusSessions.SingleOrDefaultAsync(s => s.Id == id && s.UserId == user.UserId() && s.FinishedAt == null); if (s == null) return Results.NotFound();
            if (s.Version != input.Version) return Results.Conflict(new { error = "El timer cambió en otra pestaña o dispositivo. Actualiza para continuar." });
            var now = DateTime.UtcNow;
            if (s.State == "running") s.RemainingSeconds = Math.Max(0, (int)Math.Ceiling((s.EndsAt!.Value - now).TotalSeconds));
            switch (input.Action) {
                case "goals": s.Goal = Rules.Text(input.Goal, 2000, "Objetivos", false); break;
                case "pause": if (s.State != "running") throw new InputError("La sesión ya está pausada."); s.State = "paused"; s.EndsAt = null; break;
                case "resume": if (s.State != "paused" || s.RemainingSeconds == 0) throw new InputError("Inicia la siguiente etapa."); s.State = "running"; s.EndsAt = now.AddSeconds(s.RemainingSeconds); break;
                case "next":
                    if (s.RemainingSeconds > 0) throw new InputError("Termina el intervalo antes de avanzar. Puedes finalizar la sesión cuando lo necesites.");
                    if (s.Phase == "focus") { s.CompletedCycles++; s.Phase = s.CompletedCycles % s.Cycles == 0 ? "longBreak" : "shortBreak"; }
                    else s.Phase = "focus";
                    s.RemainingSeconds = (s.Phase == "focus" ? s.FocusMinutes : s.Phase == "shortBreak" ? s.ShortBreakMinutes : s.LongBreakMinutes) * 60;
                    s.State = "running"; s.EndsAt = now.AddSeconds(s.RemainingSeconds); break;
                case "finish": if (s.Phase == "focus" && s.RemainingSeconds == 0) s.CompletedCycles++; s.FinishedAt = now; s.EndsAt = null; s.State = "finished"; break;
                default: throw new InputError("Acción no válida.");
            }
            s.Version = Guid.NewGuid(); await db.SaveChangesAsync(); return Results.Ok(s);
        });
    }
    private static async Task ValidateTasks(AppDb db, Guid userId, Guid[] ids)
    {
        var available = db.Tasks.ForAssignee("mine-or-unassigned", userId).Where(t => !t.Archived
            && db.Projects.Any(p => p.Id == t.ProjectId && !p.Archived)
            && db.Statuses.Any(s => s.Id == t.StatusId && !s.IsDone));
        // Batch validation avoids database parameter limits without imposing a selection cap.
        foreach (var batch in ids.Chunk(500))
            if (await available.CountAsync(t => batch.Contains(t.Id)) != batch.Length)
                throw new InputError("Selecciona pendientes sin completar, asignados a ti o sin responsable, de este espacio. Alguno pudo cambiar; revisa la selección.");
    }
    public record ProfileInput(int FocusMinutes, int ShortBreakMinutes, int LongBreakMinutes, int Cycles, string Theme, bool Animated, bool Sound);
    public record StartInput(string? Goal, Guid[]? TaskIds);
    public record TasksInput(Guid[]? TaskIds, Guid Version);
    public record ActionInput(string Action, Guid Version, string? Goal);
}
