namespace AegiTasks.Api.Domain;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = "";
    public string Name { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "User";
    public bool Active { get; set; } = true;
    public int SessionVersion { get; set; }
}
public class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SpaceId { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Labels { get; set; } = "";
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
    public Guid SpaceId { get; set; }
    public string Name { get; set; } = "";
    public string Color { get; set; } = "purple";
}

public class Space
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public Guid OwnerId { get; set; }
    public bool IsPersonal { get; set; }
    public string? InviteHash { get; set; }
    public DateTime? InviteExpiresAt { get; set; }
}
public class SpaceMember
{
    public Guid SpaceId { get; set; }
    public Guid UserId { get; set; }
}
public class AppRole
{
    public string Name { get; set; } = "";
    public bool IsSystem { get; set; }
}
public class PagePermission
{
    public string RoleName { get; set; } = "";
    public string Page { get; set; } = "";
    public bool Allowed { get; set; } = true;
}
public class NoteFolder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SpaceId { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = "";
}
public class Note
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SpaceId { get; set; }
    public Guid? FolderId { get; set; }
    public Guid? ProjectId { get; set; }
    public Guid? LinkedTaskId { get; set; }
    public Guid CreatedById { get; set; }
    public string Title { get; set; } = "";
    public string Markdown { get; set; } = "";
    public string Color { get; set; } = "purple";
    public string Font { get; set; } = "sans";
    public bool Pinned { get; set; }
    public bool Archived { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
public class FocusProfile
{
    public Guid UserId { get; set; }
    public int FocusMinutes { get; set; } = 25;
    public int ShortBreakMinutes { get; set; } = 5;
    public int LongBreakMinutes { get; set; } = 15;
    public int Cycles { get; set; } = 4;
    public string Theme { get; set; } = "aurora";
    public string AccentColor { get; set; } = "#A78BFA";
    public string ParticleShape { get; set; } = "mixed";
    public bool Animated { get; set; } = true;
    public bool Sound { get; set; }
}
public class FocusSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Goal { get; set; } = "";
    public string TaskIdsJson { get; set; } = "[]";
    public Guid SpaceId { get; set; }
    public int FocusMinutes { get; set; }
    public int ShortBreakMinutes { get; set; }
    public int LongBreakMinutes { get; set; }
    public int Cycles { get; set; }
    public int CompletedCycles { get; set; }
    public string Phase { get; set; } = "focus";
    public string State { get; set; } = "running";
    public int RemainingSeconds { get; set; }
    public DateTime? EndsAt { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
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
