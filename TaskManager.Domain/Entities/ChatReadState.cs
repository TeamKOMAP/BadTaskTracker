namespace TaskManager.Domain.Entities
{
    public class ChatReadState
    {
        public Guid ChatRoomId { get; set; }

        public int UserId { get; set; }

        public long LastReadMessageId { get; set; }

        public virtual ChatRoom ChatRoom { get; set; } = null!;
        public virtual User User { get; set; } = null!;
    }
}
