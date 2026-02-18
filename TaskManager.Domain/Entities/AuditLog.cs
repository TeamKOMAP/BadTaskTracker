using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class AuditLog
    {
        public int Id { get; set; }
        public int? UserId { get; set; }
        public int? TaskId { get; set; }
        public int? WorkspaceId { get; set; }

        [MaxLength(50)]
        public string Action { get; set; } = string.Empty;

        [MaxLength(50)]
        public string EntityName { get; set; } = string.Empty;

        public string? OldValue { get; set; }
        public string? NewValue { get; set; }
        public string? ChangedFields { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation
        public virtual User? User { get; set; }
        public virtual TaskItem? Task { get; set; }
    }
}