using System.ComponentModel.DataAnnotations;
using TaskManager.Domain.Enums;

namespace TaskManager.Domain.Entities
{
    public class ChatMessage
    {
        public long Id { get; set; }

        public Guid ChatRoomId { get; set; }

        public int SenderUserId { get; set; }

        public ChatMessageKind Kind { get; set; }

        [Required]
        public string BodyCipher { get; set; } = string.Empty;

        public long? ReplyToMessageId { get; set; }

        public long? ForwardedFromMessageId { get; set; }

        [MaxLength(100)]
        public string? ClientMessageId { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime? EditedAtUtc { get; set; }

        public DateTime? DeletedAtUtc { get; set; }

        public virtual ChatRoom ChatRoom { get; set; } = null!;
        public virtual User SenderUser { get; set; } = null!;
        public virtual ChatMessage? ReplyToMessage { get; set; }
        public virtual ICollection<ChatMessageAttachment> Attachments { get; set; } = new List<ChatMessageAttachment>();
    }
}
