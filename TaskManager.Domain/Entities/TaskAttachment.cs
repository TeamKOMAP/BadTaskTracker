using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class TaskAttachment
    {
        [Key]
        [MaxLength(64)]
        public string Id { get; set; } = string.Empty;

        public int TaskId { get; set; }

        [Required]
        [MaxLength(500)]
        public string ObjectKey { get; set; } = string.Empty;

        [Required]
        [MaxLength(255)]
        public string FileName { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        public string ContentType { get; set; } = "application/octet-stream";

        public long Size { get; set; }

        public DateTime UploadedAtUtc { get; set; } = DateTime.UtcNow;

        public virtual TaskItem Task { get; set; } = null!;
    }
}
