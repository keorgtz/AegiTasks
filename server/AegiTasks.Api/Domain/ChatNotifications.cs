namespace AegiTasks.Api.Domain;

public class ChatNotificationPreference
{
    public Guid ChatRoomId { get; set; }
    public Guid UserId { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public string Settings { get; set; } = "{}";
}
public class ChatAlert
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ChatRoomId { get; set; }
    public Guid UserId { get; set; }
    public Guid ChatMessageId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
public class ChatPushDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid NotificationId { get; set; }
    public Guid DeviceId { get; set; }
    public int Attempts { get; set; }
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
}
