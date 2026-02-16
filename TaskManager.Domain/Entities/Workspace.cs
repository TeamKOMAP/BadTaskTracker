using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class Workspace
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(120)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(400)]
        public string? AvatarPath { get; set; }

        public int CreatedByUserId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public virtual User CreatedByUser { get; set; } = null!;
        public virtual ICollection<WorkspaceMember> Members { get; set; } = new List<WorkspaceMember>();
        public virtual ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
        public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();
    }
}
