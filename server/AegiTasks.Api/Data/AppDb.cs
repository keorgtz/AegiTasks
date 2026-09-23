using AegiTasks.Api.Domain;
using Microsoft.EntityFrameworkCore;
using TaskStatus = AegiTasks.Api.Domain.TaskStatus;

namespace AegiTasks.Api.Data;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Folder> Folders => Set<Folder>();
    public DbSet<TaskStatus> Statuses => Set<TaskStatus>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<WorkItem> Tasks => Set<WorkItem>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<Attachment> Attachments => Set<Attachment>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().HasIndex(x => x.Email).IsUnique();
        b.Entity<User>().Property(x => x.Email).HasMaxLength(200);
        b.Entity<User>().Property(x => x.Name).HasMaxLength(80);
        b.Entity<Project>().Property(x => x.Name).HasMaxLength(80);
        b.Entity<Project>().Property(x => x.Description).HasMaxLength(1000);
        b.Entity<Folder>().HasIndex(x => new { x.ProjectId, x.Name }).IsUnique();
        b.Entity<Folder>().HasAlternateKey(x => new { x.Id, x.ProjectId });
        b.Entity<Folder>().Property(x => x.Name).HasMaxLength(80);
        b.Entity<Folder>().HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<TaskStatus>().HasAlternateKey(x => new { x.Id, x.ProjectId });
        b.Entity<TaskStatus>().HasIndex(x => new { x.ProjectId, x.Name }).IsUnique();
        b.Entity<TaskStatus>().Property(x => x.Name).HasMaxLength(80);
        b.Entity<TaskStatus>().HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Tag>().HasIndex(x => x.Name).IsUnique();
        b.Entity<Tag>().Property(x => x.Name).HasMaxLength(30);
        b.Entity<WorkItem>().Property(x => x.Title).HasMaxLength(200);
        b.Entity<WorkItem>().Property(x => x.Description).HasMaxLength(12000);
        b.Entity<WorkItem>().Property(x => x.Version).IsConcurrencyToken();
        b.Entity<WorkItem>().HasIndex(x => new { x.ProjectId, x.Archived, x.StatusId });
        b.Entity<WorkItem>().HasIndex(x => x.UpdatedAt);
        b.Entity<WorkItem>().HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WorkItem>().HasOne<Folder>().WithMany().HasForeignKey(x => new { x.FolderId, x.ProjectId }).HasPrincipalKey(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WorkItem>().HasOne<TaskStatus>().WithMany().HasForeignKey(x => new { x.StatusId, x.ProjectId }).HasPrincipalKey(x => new { x.Id, x.ProjectId }).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WorkItem>().HasOne<User>().WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WorkItem>().HasOne<User>().WithMany().HasForeignKey(x => x.AssigneeId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<WorkItem>().HasMany(x => x.Tags).WithMany().UsingEntity("WorkItemTags");
        b.Entity<Activity>().Property(x => x.Body).HasMaxLength(4000);
        b.Entity<Activity>().HasOne<WorkItem>().WithMany().HasForeignKey(x => x.WorkItemId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Activity>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Attachment>().HasOne<WorkItem>().WithMany().HasForeignKey(x => x.WorkItemId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Attachment>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
