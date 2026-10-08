namespace AegiTasks.Api.Domain;

public class TaskNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid SpaceId { get; set; }
    public Guid? WorkItemId { get; set; }
    public Guid? ReminderId { get; set; }
    public string Kind { get; set; } = "updated";
    public string TaskTitle { get; set; } = "";
    public string Message { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
}

public class PushDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public int SessionVersion { get; set; }
    public string Endpoint { get; set; } = "";
    public string EndpointHash { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// One durable delivery per notification/device; independent retries never block task saves.
public class PushDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid NotificationId { get; set; }
    public Guid DeviceId { get; set; }
    public int Attempts { get; set; }
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
}
