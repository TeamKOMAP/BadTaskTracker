namespace TaskManager.Chat.Application.Configuration
{
    public class ChatSettings
    {
        public bool Enabled { get; set; } = false;
        public int MaxMessageLength { get; set; } = 4000;
        public int MaxAttachmentsPerMessage { get; set; } = 5;
    }
}
