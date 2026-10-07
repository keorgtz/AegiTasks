using System.Text.Json;

namespace AegiTasks.Api.Services;

public record ChatQuietPeriod(int[] Days, int StartMinute, int EndMinute);
public record ChatSilence(string Mode = "on", DateTime? Until = null, string TimeZone = "UTC", ChatQuietPeriod[]? Periods = null)
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    public static ChatSilence Parse(string? json)
    {
        if (json == null) return new();
        try { return JsonSerializer.Deserialize<ChatSilence>(json, Options) ?? new("always"); }
        catch (JsonException) { return new("always"); }
    }
    public string Serialize() => JsonSerializer.Serialize(this, Options);
    public void Validate(DateTime now)
    {
        if (Mode is not ("on" or "always" or "until" or "schedule")) throw new InputError("Opción de notificaciones no válida.");
        if (Mode == "until" && (Until == null || Until <= now || Until > now.AddDays(366))) throw new InputError("Elige una fecha futura dentro de los próximos 366 días.");
        if (TimeZone == null || TimeZone.Length > 100) throw new InputError("Zona horaria no válida.");
        try { TimeZoneInfo.FindSystemTimeZoneById(TimeZone); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { throw new InputError("Zona horaria no válida."); }
        if ((Periods?.Length ?? 0) > 14 || Mode == "schedule" && (Periods?.Length ?? 0) == 0) throw new InputError("Agrega de 1 a 14 horarios para el silencio semanal.");
        foreach (var period in Periods ?? [])
            if (period == null || period.Days == null || period.Days.Length is < 1 or > 7 || period.Days.Distinct().Count() != period.Days.Length || period.Days.Any(d => d is < 0 or > 6) || period.StartMinute is < 0 or > 1439 || period.EndMinute is < 0 or > 1439)
                throw new InputError("Revisa los días y horas del horario de silencio.");
    }
    public bool Muted(DateTime utc)
    {
        if (Mode == "always") return true;
        if (Mode == "until") return Until > utc;
        if (Mode != "schedule") return false;
        try {
            var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), TimeZoneInfo.FindSystemTimeZoneById(TimeZone));
            var day = (int)local.DayOfWeek; var minute = local.Hour * 60 + local.Minute;
            foreach (var p in Periods ?? []) {
                if (p.StartMinute == p.EndMinute && p.Days.Contains(day)) return true;
                if (p.StartMinute < p.EndMinute && p.Days.Contains(day) && minute >= p.StartMinute && minute < p.EndMinute) return true;
                if (p.StartMinute > p.EndMinute && (p.Days.Contains(day) && minute >= p.StartMinute || p.Days.Contains((day + 6) % 7) && minute < p.EndMinute)) return true;
            }
            return false;
        } catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { return true; }
    }
}
