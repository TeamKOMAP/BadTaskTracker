using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class Notification
    {
        public int Id { get; set; }

        [Required]
        public int UserId { get; set; }

        [Required]
        [MaxLength(50)]
        public string Type { get; set; } = string.Empty; // "deadline", "mention", etc

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [Required]
        [MaxLength(1000)]
        public string Message { get; set; } = string.Empty;

        public int? TaskId { get; set; }

        public int? WorkspaceId { get; set; }

        [MaxLength(300)]
        public string? ActionUrl { get; set; }

        public bool IsRead { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public virtual User User { get; set; } = null!;
        public virtual TaskItem? Task { get; set; }
        public virtual Workspace? Workspace { get; set; }
    }
}
