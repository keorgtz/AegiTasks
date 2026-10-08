namespace AegiTasks.Api.Domain;

public class Reminder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SpaceId { get; set; }
    public Guid? ProjectId { get; set; }
    public Guid? WorkItemId { get; set; }
    public Guid CreatedById { get; set; }
    public Guid? RecipientId { get; set; }
    public string Audience { get; set; } = "workspace";
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public string ScheduleJson { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public DateTime? NextRunAt { get; set; }
    public DateTime? LastSentAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Guid Version { get; set; } = Guid.NewGuid();
}
