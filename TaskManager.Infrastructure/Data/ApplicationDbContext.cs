using Microsoft.EntityFrameworkCore;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Infrastructure.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Workspace> Workspaces { get; set; }
        public DbSet<WorkspaceMember> WorkspaceMembers { get; set; }
        public DbSet<TaskItem> Tasks { get; set; }
        public DbSet<Tag> Tags { get; set; }
        public DbSet<TaskTag> TaskTags { get; set; }
        public DbSet<EmailAuthCode> EmailAuthCodes { get; set; }
        public DbSet<Notification> Notifications { get; set; }
        public DbSet<WorkspaceInvitation> WorkspaceInvitations { get; set; }
        public DbSet<TaskAttachment> TaskAttachments { get; set; }
        public DbSet<ChatRoom> ChatRooms { get; set; }
        public DbSet<ChatRoomMember> ChatRoomMembers { get; set; }
        public DbSet<ChatMessage> ChatMessages { get; set; }
        public DbSet<ChatMessageAttachment> ChatMessageAttachments { get; set; }
        public DbSet<ChatReadState> ChatReadStates { get; set; }
        public DbSet<ChatUserPreferences> ChatUserPreferences { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(u => u.Id);
                entity.Property(u => u.Name).IsRequired().HasMaxLength(100);
                entity.Property(u => u.Email).IsRequired().HasMaxLength(100);
                entity.Property(u => u.TimeZoneId).IsRequired().HasMaxLength(100).HasDefaultValue("UTC");
                entity.Property(u => u.AvatarPath).HasMaxLength(400);
                entity.Property(u => u.AvatarObjectKey).HasMaxLength(500);
                entity.Property(u => u.NicknameChangedAtUtc);
                entity.HasIndex(u => u.Email).IsUnique();
                entity.Property(u => u.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            });

            modelBuilder.Entity<Workspace>(entity =>
            {
                entity.HasKey(w => w.Id);
                entity.Property(w => w.Name).IsRequired().HasMaxLength(120);
                entity.Property(w => w.AvatarPath).HasMaxLength(400);
                entity.Property(w => w.AvatarObjectKey).HasMaxLength(500);
                entity.Property(w => w.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(w => w.CreatedByUser)
                    .WithMany(u => u.OwnedWorkspaces)
                    .HasForeignKey(w => w.CreatedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasIndex(w => w.CreatedByUserId);
                entity.HasIndex(w => w.CreatedAt);
            });

            modelBuilder.Entity<WorkspaceMember>(entity =>
            {
                entity.HasKey(m => new { m.WorkspaceId, m.UserId });

                entity.Property(m => m.Role)
                    .IsRequired()
                    .HasConversion<int>();

                entity.Property(m => m.AddedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(m => m.Workspace)
                    .WithMany(w => w.Members)
                    .HasForeignKey(m => m.WorkspaceId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(m => m.User)
                    .WithMany(u => u.WorkspaceMemberships)
                    .HasForeignKey(m => m.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(m => m.UserId);
                entity.HasIndex(m => m.Role);
            });

            modelBuilder.Entity<TaskItem>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.ToTable("Tasks");
                entity.Property(t => t.Title).IsRequired().HasMaxLength(200);
                entity.Property(t => t.Description).HasMaxLength(1000);
                entity.Property(t => t.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
                entity.Property(t => t.DueDate).IsRequired();

                entity.Property(t => t.Status)
                    .IsRequired()
                    .HasConversion<string>()
                    .HasMaxLength(20);

                entity.Property(t => t.Priority)
                    .IsRequired()
                    .HasConversion<int>();

                entity.HasOne(t => t.Assignee)
                    .WithMany(u => u.Tasks)
                    .HasForeignKey(t => t.AssigneeId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(t => t.Workspace)
                    .WithMany(w => w.Tasks)
                    .HasForeignKey(t => t.WorkspaceId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(t => t.WorkspaceId);
                entity.HasIndex(t => new { t.WorkspaceId, t.AssigneeId });
                entity.HasIndex(t => new { t.WorkspaceId, t.Status });
                entity.HasIndex(t => new { t.WorkspaceId, t.Priority });
                entity.HasIndex(t => new { t.WorkspaceId, t.DueDate });
                entity.HasIndex(t => t.CreatedAt);
                entity.HasIndex(t => t.CompletedAt);
            });

            modelBuilder.Entity<TaskAttachment>(entity =>
            {
                entity.HasKey(a => a.Id);
                entity.Property(a => a.Id).HasMaxLength(64);
                entity.Property(a => a.ObjectKey).IsRequired().HasMaxLength(500);
                entity.Property(a => a.FileName).IsRequired().HasMaxLength(255);
                entity.Property(a => a.ContentType).IsRequired().HasMaxLength(150);
                entity.Property(a => a.UploadedAtUtc).IsRequired();

                entity.HasOne(a => a.Task)
                    .WithMany(t => t.Attachments)
                    .HasForeignKey(a => a.TaskId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(a => new { a.TaskId, a.UploadedAtUtc });
            });

            modelBuilder.Entity<Tag>(entity =>
            {
                entity.HasKey(t => t.Id);
                entity.Property(t => t.Name).IsRequired().HasMaxLength(50);
                entity.Property(t => t.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(t => t.Workspace)
                    .WithMany(w => w.Tags)
                    .HasForeignKey(t => t.WorkspaceId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(t => t.WorkspaceId);
                entity.HasIndex(t => new { t.WorkspaceId, t.Name }).IsUnique();
            });

            modelBuilder.Entity<TaskTag>(entity =>
            {
                entity.HasKey(tt => new { tt.TaskId, tt.TagId });

                entity.HasOne(tt => tt.Task)
                    .WithMany(t => t.TaskTags)
                    .HasForeignKey(tt => tt.TaskId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(tt => tt.Tag)
                    .WithMany(t => t.TaskTags)
                    .HasForeignKey(tt => tt.TagId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.Property(tt => tt.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            });

            modelBuilder.Entity<EmailAuthCode>(entity =>
            {
                entity.HasKey(x => x.Id);
                entity.Property(x => x.Email).IsRequired().HasMaxLength(100);
                entity.Property(x => x.CodeHash).IsRequired().HasMaxLength(200);
                entity.Property(x => x.CodeSalt).IsRequired().HasMaxLength(200);
                entity.Property(x => x.AttemptsUsed).IsRequired().HasDefaultValue(0);
                entity.Property(x => x.IsConsumed).IsRequired().HasDefaultValue(false);
                entity.Property(x => x.CreatedAtUtc).IsRequired();
                entity.Property(x => x.ExpiresAtUtc).IsRequired();
                entity.Property(x => x.ResendAvailableAtUtc).IsRequired();

                entity.HasIndex(x => x.Email);
                entity.HasIndex(x => new { x.Email, x.IsConsumed, x.ExpiresAtUtc });
                entity.HasIndex(x => x.CreatedAtUtc);
            });

            modelBuilder.Entity<Notification>(entity =>
            {
                entity.HasKey(n => n.Id);

                entity.Property(n => n.Type)
                    .IsRequired()
                    .HasMaxLength(50);

                entity.Property(n => n.Title)
                    .IsRequired()
                    .HasMaxLength(200);

                entity.Property(n => n.Message)
                    .IsRequired()
                    .HasMaxLength(1000);

                entity.Property(n => n.ActionUrl)
                    .HasMaxLength(300);

                entity.Property(n => n.CreatedAt)
                    .HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(n => n.User)
                    .WithMany()
                    .HasForeignKey(n => n.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(n => n.Task)
                    .WithMany()
                    .HasForeignKey(n => n.TaskId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasOne(n => n.Workspace)
                    .WithMany()
                    .HasForeignKey(n => n.WorkspaceId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasIndex(n => n.UserId);
                entity.HasIndex(n => new { n.UserId, n.IsRead });
                entity.HasIndex(n => n.WorkspaceId);
                entity.HasIndex(n => n.CreatedAt);
            });

            modelBuilder.Entity<WorkspaceInvitation>(entity =>
            {
                entity.HasKey(i => i.Id);

                entity.Property(i => i.InvitedEmail)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(i => i.Role)
                    .IsRequired()
                    .HasConversion<int>();

                entity.Property(i => i.Status)
                    .IsRequired()
                    .HasConversion<int>();

                entity.Property(i => i.CreatedAtUtc).IsRequired();
                entity.Property(i => i.ExpiresAtUtc).IsRequired();

                entity.HasOne(i => i.Workspace)
                    .WithMany()
                    .HasForeignKey(i => i.WorkspaceId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(i => i.InvitedByUser)
                    .WithMany()
                    .HasForeignKey(i => i.InvitedByUserId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(i => i.InvitedUser)
                    .WithMany()
                    .HasForeignKey(i => i.InvitedUserId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasIndex(i => new { i.WorkspaceId, i.InvitedEmail, i.Status });
                entity.HasIndex(i => new { i.InvitedUserId, i.Status });
                entity.HasIndex(i => i.ExpiresAtUtc);
                entity.HasIndex(i => i.CreatedAtUtc);
            });

            modelBuilder.Entity<ChatRoom>(entity =>
            {
                entity.HasKey(c => c.Id);
                entity.Property(c => c.Type).IsRequired().HasConversion<int>();
                entity.Property(c => c.Title).HasMaxLength(200);
                entity.Property(c => c.DirectKey).HasMaxLength(64);
                entity.Property(c => c.CreatedAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");
                entity.Property(c => c.UpdatedAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(c => c.Workspace)
                    .WithMany(w => w.ChatRooms)
                    .HasForeignKey(c => c.WorkspaceId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(c => c.WorkspaceId);
                entity.HasIndex(c => new { c.WorkspaceId, c.Type })
                    .HasDatabaseName("IX_ChatRooms_WorkspaceId_Type");
                entity.HasIndex(c => c.TaskId).IsUnique();
                entity.HasIndex(c => new { c.WorkspaceId, c.Type })
                    .HasFilter("\"Type\" = 1")
                    .IsUnique()
                    .HasDatabaseName("UX_ChatRooms_WorkspaceId_General");
                entity.HasIndex(c => new { c.WorkspaceId, c.Type, c.DirectKey })
                    .HasFilter("\"Type\" = 3 AND \"DirectKey\" IS NOT NULL")
                    .IsUnique()
                    .HasDatabaseName("UX_ChatRooms_WorkspaceId_DirectKey");
            });

            modelBuilder.Entity<ChatRoomMember>(entity =>
            {
                entity.HasKey(m => new { m.ChatRoomId, m.UserId });

                entity.Property(m => m.Role)
                    .IsRequired()
                    .HasConversion<int>();

                entity.Property(m => m.JoinedAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(m => m.ChatRoom)
                    .WithMany(c => c.Members)
                    .HasForeignKey(m => m.ChatRoomId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(m => m.User)
                    .WithMany(u => u.ChatRoomMemberships)
                    .HasForeignKey(m => m.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(m => m.UserId);
                entity.HasIndex(m => m.Role);
            });

            modelBuilder.Entity<ChatMessage>(entity =>
            {
                entity.HasKey(m => m.Id);

                entity.Property(m => m.Kind)
                    .IsRequired()
                    .HasConversion<int>();

                entity.Property(m => m.BodyCipher).IsRequired();
                entity.Property(m => m.ClientMessageId).HasMaxLength(100);
                entity.Property(m => m.CreatedAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(m => m.ChatRoom)
                    .WithMany(c => c.Messages)
                    .HasForeignKey(m => m.ChatRoomId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(m => m.SenderUser)
                    .WithMany(u => u.SentMessages)
                    .HasForeignKey(m => m.SenderUserId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(m => m.ReplyToMessage)
                    .WithMany()
                    .HasForeignKey(m => m.ReplyToMessageId)
                    .OnDelete(DeleteBehavior.SetNull);

                entity.HasIndex(m => m.ChatRoomId);
                entity.HasIndex(m => m.SenderUserId);
                entity.HasIndex(m => m.CreatedAtUtc);
                entity.HasIndex(m => new { m.ChatRoomId, m.ClientMessageId })
                    .HasFilter("\"ClientMessageId\" IS NOT NULL")
                    .IsUnique()
                    .HasDatabaseName("UX_ChatMessages_ChatRoomId_ClientMessageId");
                entity.HasIndex(m => new { m.ChatRoomId, m.CreatedAtUtc });
            });

            modelBuilder.Entity<ChatMessageAttachment>(entity =>
            {
                entity.HasKey(a => a.Id);
                entity.Property(a => a.ObjectKey).IsRequired().HasMaxLength(500);
                entity.Property(a => a.FileName).IsRequired().HasMaxLength(255);
                entity.Property(a => a.ContentType).IsRequired().HasMaxLength(150);

                entity.HasOne(a => a.Message)
                    .WithMany(m => m.Attachments)
                    .HasForeignKey(a => a.MessageId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(a => a.MessageId);
            });

            modelBuilder.Entity<ChatReadState>(entity =>
            {
                entity.HasKey(r => new { r.ChatRoomId, r.UserId });

                entity.HasOne(r => r.ChatRoom)
                    .WithMany()
                    .HasForeignKey(r => r.ChatRoomId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(r => r.User)
                    .WithMany(u => u.ChatReadStates)
                    .HasForeignKey(r => r.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(r => r.UserId);
            });

            modelBuilder.Entity<ChatUserPreferences>(entity =>
            {
                entity.HasKey(p => new { p.UserId, p.ChatRoomId });
                entity.Property(p => p.IsMuted).HasDefaultValue(false);
                entity.Property(p => p.SoundEnabled).HasDefaultValue(true);
                entity.Property(p => p.BackgroundImageKey).HasMaxLength(500);
                entity.Property(p => p.UpdatedAtUtc).HasDefaultValueSql("CURRENT_TIMESTAMP");

                entity.HasOne(p => p.User)
                    .WithMany()
                    .HasForeignKey(p => p.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(p => p.ChatRoom)
                    .WithMany()
                    .HasForeignKey(p => p.ChatRoomId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasIndex(p => p.UserId);
                entity.HasIndex(p => p.ChatRoomId);
            });
        }
    }
}
