using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class ChatMessageAttachment
    {
        public Guid Id { get; set; }

        public long MessageId { get; set; }

        [Required]
        [MaxLength(500)]
        public string ObjectKey { get; set; } = string.Empty;

        [Required]
        [MaxLength(255)]
        public string FileName { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        public string ContentType { get; set; } = string.Empty;

        public long Size { get; set; }

        public int? DurationMs { get; set; }

        public virtual ChatMessage Message { get; set; } = null!;
    }
}
