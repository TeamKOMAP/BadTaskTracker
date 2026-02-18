using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using TaskManager.Domain.Enums;

namespace TaskManager.Domain.Entities
{
    public class TaskItem
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string? Description { get; set; }

        public int? AssigneeId { get; set; }

        public int WorkspaceId { get; set; }

        public System.DateTime CreatedAt { get; set; } = System.DateTime.UtcNow;
        public System.DateTime? UpdatedAt { get; set; }

        [Required]
        public System.DateTime DueDate { get; set; }

        public System.DateTime? CompletedAt { get; set; }

        [Required]
        public TaskItemStatus Status { get; set; } = TaskItemStatus.New;

        [Required]
        public TaskPriority Priority { get; set; } = TaskPriority.Medium;

        // ПОЛЯ ДЛЯ УВЕДОМЛЕНИЙ
        public bool DeadlineNotificationSent { get; set; }
        public DateTime? DeadlineNotificationSentAt { get; set; }

        public virtual User? Assignee { get; set; }
        public virtual Workspace Workspace { get; set; } = null!;
        public virtual System.Collections.Generic.ICollection<TaskTag> TaskTags { get; set; } = new System.Collections.Generic.List<TaskTag>();

        [NotMapped]
        public System.Collections.Generic.IEnumerable<Tag> Tags => TaskTags.Select(tt => tt.Tag);

        [NotMapped]
        public bool IsOverdue => Status != TaskItemStatus.Done && DueDate < DateTime.UtcNow;
    }
}