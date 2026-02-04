using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TaskManager.Domain.Entities
{
    public class Tag
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Name { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties (many-to-many)
        public virtual ICollection<TaskTag> TaskTags { get; set; } = new List<TaskTag>(); // ← ИЗМЕНИТЬ!

        // Helper property to get Tasks directly
        [NotMapped]
        public IEnumerable<TaskItem> Tasks => TaskTags.Select(tt => tt.Task);
    }
}