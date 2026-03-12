using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class ChatUserPreferences
    {
        public int UserId { get; set; }

        public Guid ChatRoomId { get; set; }

        public bool IsMuted { get; set; }

        public bool SoundEnabled { get; set; } = true;

        [MaxLength(500)]
        public string? BackgroundImageKey { get; set; }

        public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

        public virtual User User { get; set; } = null!;
        public virtual ChatRoom ChatRoom { get; set; } = null!;
    }
}
