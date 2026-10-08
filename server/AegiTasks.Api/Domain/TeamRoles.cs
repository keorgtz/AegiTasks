namespace AegiTasks.Api.Domain;

public class TeamRole
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SpaceId { get; set; }
    public string Name { get; set; } = "";
    public string NormalizedName { get; set; } = "";
    public string Description { get; set; } = "";
    public Guid Version { get; set; } = Guid.NewGuid();
}

public class TeamRoleAssignment
{
    public Guid SpaceId { get; set; }
    public Guid UserId { get; set; }
    public Guid TeamRoleId { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
}
