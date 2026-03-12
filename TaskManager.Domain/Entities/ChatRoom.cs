using System.ComponentModel.DataAnnotations;
using TaskManager.Domain.Enums;

namespace TaskManager.Domain.Entities
{
    public class ChatRoom
    {
        public Guid Id { get; set; }

        public int WorkspaceId { get; set; }

        public ChatRoomType Type { get; set; }

        [MaxLength(200)]
        public string? Title { get; set; }

        public int? TaskId { get; set; }

        public int CreatedByUserId { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

        public virtual Workspace Workspace { get; set; } = null!;
        public virtual ICollection<ChatRoomMember> Members { get; set; } = new List<ChatRoomMember>();
        public virtual ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
    }
}
