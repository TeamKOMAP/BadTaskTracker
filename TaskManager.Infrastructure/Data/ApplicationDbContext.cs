using Microsoft.EntityFrameworkCore;
using TaskManager.Domain.Entities;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaskManager.Infrastructure.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<TaskItem> Tasks { get; set; }
        public DbSet<Tag> Tags { get; set; }
        public DbSet<TaskTag> TaskTags { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User configuration
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(u => u.Id);
                entity.Property(u => u.Name).IsRequired().HasMaxLength(100);
                entity.Property(u => u.Email).IsRequired().HasMaxLength(100);
                entity.HasIndex(u => u.Email).IsUnique();
                entity.Property(u => u.CreatedAt).HasDefaultValueSql("datetime('now')");
            });

            // Task configuration
            modelBuilder.Entity<TaskItem>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.ToTable("Tasks"); // Explicit table name
                entity.Property(t => t.Title).IsRequired().HasMaxLength(200);
                entity.Property(t => t.Description).HasMaxLength(1000);
                entity.Property(t => t.CreatedAt).HasDefaultValueSql("datetime('now')");
                entity.Property(t => t.DueDate).IsRequired();

                // Enum conversions
                entity.Property(t => t.Status)
                    .IsRequired()
                    .HasConversion<string>()
                    .HasMaxLength(20);

                entity.Property(t => t.Priority)
                    .IsRequired()
                    .HasConversion<int>();

                // Foreign key to User
                entity.HasOne(t => t.Assignee)
                    .WithMany(u => u.Tasks)
                    .HasForeignKey(t => t.AssigneeId)
                    .OnDelete(DeleteBehavior.SetNull);
            });

            // Tag configuration
            modelBuilder.Entity<Tag>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.Name).IsRequired().HasMaxLength(50);
                entity.HasIndex(t => t.Name).IsUnique();
                entity.Property(t => t.CreatedAt).HasDefaultValueSql("datetime('now')");
            });

            // TaskTag configuration (many-to-many)
            modelBuilder.Entity<TaskTag>(entity =>
            {
                // Composite primary key
                entity.HasKey(tt => new { tt.TaskId, tt.TagId });

                // Foreign key to Task
                entity.HasOne(tt => tt.Task)
                    .WithMany(t => t.TaskTags)
                    .HasForeignKey(tt => tt.TaskId)
                    .OnDelete(DeleteBehavior.Cascade);

                // Foreign key to Tag
                entity.HasOne(tt => tt.Tag)
                    .WithMany(t => t.TaskTags)
                    .HasForeignKey(tt => tt.TagId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.Property(tt => tt.CreatedAt).HasDefaultValueSql("datetime('now')");
            });

            // Indexes for performance
            modelBuilder.Entity<TaskItem>()
                .HasIndex(t => t.Status);

            modelBuilder.Entity<TaskItem>()
                .HasIndex(t => t.Priority);

            modelBuilder.Entity<TaskItem>()
                .HasIndex(t => t.DueDate);

            modelBuilder.Entity<TaskItem>()
                .HasIndex(t => t.CreatedAt);

            modelBuilder.Entity<TaskItem>()
                .HasIndex(t => t.CompletedAt);

            modelBuilder.Entity<TaskItem>()
                .HasIndex(t => t.AssigneeId);
        }
    }
}