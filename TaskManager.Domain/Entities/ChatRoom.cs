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

        [MaxLength(64)]
        public string? DirectKey { get; set; }

        public int? TaskId { get; set; }

        public int CreatedByUserId { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

        public virtual Workspace Workspace { get; set; } = null!;
        public virtual ICollection<ChatRoomMember> Members { get; set; } = new List<ChatRoomMember>();
        public virtual ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();

        public static string BuildDirectKey(int firstUserId, int secondUserId)
        {
            if (firstUserId <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(firstUserId), "User ids must be positive");
            }

            if (secondUserId <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(secondUserId), "User ids must be positive");
            }

            var min = Math.Min(firstUserId, secondUserId);
            var max = Math.Max(firstUserId, secondUserId);
            return $"{min}:{max}";
        }
    }
}
