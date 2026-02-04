using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using TaskManager.Domain.Enums;
using DomainTaskStatus = TaskManager.Domain.Enums.TaskStatus;
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

        // Foreign key to User
        public int? AssigneeId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Required]
        public DateTime DueDate { get; set; }

        public DateTime? CompletedAt { get; set; }

        [Required]
        public Enums.TaskStatus Status { get; set; } = Enums.TaskStatus.New;

        [Required]
        public TaskPriority Priority { get; set; } = TaskPriority.Medium;

        // Navigation properties
        public virtual User? Assignee { get; set; }
        public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();

        public bool IsOverdue => Status != Enums.TaskStatus.Done && DueDate < DateTime.UtcNow;
    }
}