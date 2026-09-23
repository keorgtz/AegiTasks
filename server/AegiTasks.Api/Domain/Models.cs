namespace AegiTasks.Api.Domain;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = "";
    public string Name { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Member";
    public bool Active { get; set; } = true;
    public int SessionVersion { get; set; }
}
public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Color { get; set; } = "purple";
    public bool Archived { get; set; }
}
public class Folder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
}
public class TaskStatus
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = "";
    public string Color { get; set; } = "purple";
    public int Position { get; set; }
    public bool IsDone { get; set; }
}
public class Tag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Color { get; set; } = "purple";
}
public class WorkItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Guid? FolderId { get; set; }
    public Guid StatusId { get; set; }
    public Guid CreatedById { get; set; }
    public Guid? AssigneeId { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public int? Priority { get; set; }
    public DateOnly? DueDate { get; set; }
    public int? EstimateMinutes { get; set; }
    public bool Archived { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Guid Version { get; set; } = Guid.NewGuid();
    public List<Tag> Tags { get; set; } = [];
}
public class Activity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkItemId { get; set; }
    public Guid UserId { get; set; }
    public string Kind { get; set; } = "comment";
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
public class Attachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkItemId { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
