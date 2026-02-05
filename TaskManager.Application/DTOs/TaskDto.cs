using System.ComponentModel.DataAnnotations;
using TaskManager.Domain.Enums;
using TStatus = TaskManager.Domain.Enums.TaskItemStatus;

namespace TaskManager.Application.DTOs
{
    public class TaskDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public TaskItemStatus Status { get; set; }
        public int? AssigneeId { get; set; }
        public string? AssigneeName { get; set; }
        public DateTime DueDate { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public TaskPriority Priority { get; set; }
        public List<int> TagIds { get; set; } = new();
    }

    public class CreateTaskDto
    {
        [Required]
        [StringLength(200, MinimumLength = 3)]
        public string Title { get; set; } = string.Empty;

        public string Description { get; set; } = string.Empty;

        [Required]
        public int? AssigneeId { get; set; }

        [Required]
        public DateTime DueDate { get; set; }

        public TaskPriority Priority { get; set; } = TaskPriority.Medium;

        public List<int> TagIds { get; set; } = new();
    }

    public class UpdateTaskDto
    {
        public int Id { get; set; }

        [Required]
        [StringLength(200, MinimumLength = 3)]
        public string Title { get; set; } = string.Empty;

        public string Description { get; set; } = string.Empty;

        [Required]
        public TaskItemStatus Status { get; set; }

        [Required]
        public int? AssigneeId { get; set; }

        [Required]
        public DateTime DueDate { get; set; }

        public TaskPriority Priority { get; set; }

        public List<int> TagIds { get; set; } = new();
    }
}