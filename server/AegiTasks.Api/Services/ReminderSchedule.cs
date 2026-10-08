using System.Text.Json;

namespace AegiTasks.Api.Services;

public record ReminderSchedule(string Mode = "interval", int Every = 1, string Unit = "hours", int[]? Days = null, string Time = "09:00", string TimeZone = "UTC", DateTime StartsAt = default)
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    public string Serialize() => JsonSerializer.Serialize(this, Options);
    public static ReminderSchedule Parse(string value) => JsonSerializer.Deserialize<ReminderSchedule>(value, Options) ?? throw new InputError("Programación no válida.");
    public void Validate()
    {
        if (Mode is not ("interval" or "weekly" or "once") || Unit is not ("minutes" or "hours" or "days") || Every is < 1 or > 10000)
            throw new InputError("Elige una frecuencia válida (de 1 a 10000 unidades).");
        if (StartsAt.Kind != DateTimeKind.Utc || StartsAt.Year is < 2000 or > 2090) throw new InputError("Elige una fecha inicial válida con zona horaria.");
        if (TimeZone is null || TimeZone.Length > 100) throw new InputError("Zona horaria no válida.");
        try { TimeZoneInfo.FindSystemTimeZoneById(TimeZone); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { throw new InputError("Zona horaria no válida."); }
        if (!TimeOnly.TryParseExact(Time, "HH:mm", out _)) throw new InputError("Elige una hora válida.");
        if ((Days?.Length ?? 0) > 7 || (Days ?? []).Any(d => d is < 0 or > 6) || (Days ?? []).Distinct().Count() != (Days?.Length ?? 0) || Mode == "weekly" && (Days?.Length ?? 0) == 0)
            throw new InputError("Selecciona los días de la semana sin repetirlos.");
    }
    // Strictly after the boundary: outages coalesce missed occurrences instead of flooding users.
    public DateTime? Next(DateTime after)
    {
        if (Mode == "once") return StartsAt > after ? StartsAt : null;
        if (Mode == "interval" && Unit != "days") {
            var ticks = TimeSpan.TicksPerMinute * (long)Every * (Unit == "hours" ? 60 : 1);
            if (StartsAt > after) return StartsAt;
            return StartsAt.AddTicks(((after.Ticks - StartsAt.Ticks) / ticks + 1) * ticks);
        }
        var zone = TimeZoneInfo.FindSystemTimeZoneById(TimeZone);
        var anchor = TimeZoneInfo.ConvertTimeFromUtc(StartsAt, zone);
        var local = TimeZoneInfo.ConvertTimeFromUtc(after, zone);
        if (Mode == "interval") {
            var periods = Math.Max(0, (int)(local.Date - anchor.Date).TotalDays / Every);
            var candidate = anchor.Date.AddDays((long)periods * Every).Add(anchor.TimeOfDay);
            var utc = ToUtc(candidate, zone);
            return utc > after && utc >= StartsAt ? utc : ToUtc(candidate.AddDays(Every), zone);
        }
        var first = local.Date > anchor.Date ? local.Date : anchor.Date;
        for (var day = 0; day <= 7; day++) {
            var date = first.AddDays(day);
            if (!(Days ?? []).Contains((int)date.DayOfWeek)) continue;
            var candidate = ToUtc(date.Add(TimeOnly.ParseExact(Time, "HH:mm").ToTimeSpan()), zone);
            if (candidate > after && candidate >= StartsAt) return candidate;
        }
        throw new InputError("No se pudo calcular el próximo recordatorio.");
    }
    private static DateTime ToUtc(DateTime local, TimeZoneInfo zone)
    {
        local = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        // On spring-forward gaps use the first valid minute; on repeated hours send only once.
        while (zone.IsInvalidTime(local)) local = local.AddMinutes(1);
        if (zone.IsAmbiguousTime(local)) return new DateTimeOffset(local, zone.GetAmbiguousTimeOffsets(local).Max()).UtcDateTime;
        return TimeZoneInfo.ConvertTimeToUtc(local, zone);
    }
}
