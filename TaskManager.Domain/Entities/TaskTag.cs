using System;

namespace TaskManager.Domain.Entities
{
    public class TaskTag
    {
        public int TaskId { get; set; }
        public int TagId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public virtual TaskItem Task { get; set; } = null!;
        public virtual Tag Tag { get; set; } = null!;
    }
}