namespace AegiTasks.Api.Domain;

public class ChatRoom
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string? DirectKey { get; set; }
    public Guid OwnerId { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public long NextSequence { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
public class ChatMember
{
    public Guid ChatRoomId { get; set; }
    public Guid UserId { get; set; }
    public DateTime? ReadAt { get; set; }
    public long ReadSequence { get; set; }
}
public class ChatMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ChatRoomId { get; set; }
    public Guid UserId { get; set; }
    public Guid ClientId { get; set; }
    public long Sequence { get; set; }
    public string Body { get; set; } = "";
    public Guid? TaskId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
public class ChatFile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ChatMessageId { get; set; }
    public string Name { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
}
