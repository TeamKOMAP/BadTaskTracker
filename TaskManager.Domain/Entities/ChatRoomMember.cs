using TaskManager.Domain.Enums;

namespace TaskManager.Domain.Entities
{
    public class ChatRoomMember
    {
        public Guid ChatRoomId { get; set; }

        public int UserId { get; set; }

        public ChatMemberRole Role { get; set; } = ChatMemberRole.Member;

        public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;

        public virtual ChatRoom ChatRoom { get; set; } = null!;
        public virtual User User { get; set; } = null!;
    }
}
