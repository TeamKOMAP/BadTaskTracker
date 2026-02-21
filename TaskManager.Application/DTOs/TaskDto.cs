using TaskManager.Domain.Enums;

namespace TaskManager.Application.DTOs
{
    public class TaskDto
    {
        public int Id { get; set; }
        public int WorkspaceId { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public TaskItemStatus Status { get; set; }
        public int? AssigneeId { get; set; }
        public string? AssigneeName { get; set; }
        public DateTime DueDate { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public bool DoneApprovalPending { get; set; }
        public int? DoneApprovalRequestedByUserId { get; set; }
        public DateTime? DoneApprovalRequestedAtUtc { get; set; }
        public TaskPriority Priority { get; set; }
        public List<int> TagIds { get; set; } = new List<int>();
        public int AttachmentCount { get; set; }
        public bool IsOverdue { get; set; } 
    }

    public class CreateTaskDto
    {
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public int? AssigneeId { get; set; }
        public DateTime DueDate { get; set; }
        public TaskPriority Priority { get; set; }
        public List<int>? TagIds { get; set; }
    }

    public class UpdateTaskDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        public TaskItemStatus Status { get; set; }
        public int? AssigneeId { get; set; }
        public DateTime DueDate { get; set; }
        public TaskPriority Priority { get; set; }
        public List<int>? TagIds { get; set; }
    }
}
