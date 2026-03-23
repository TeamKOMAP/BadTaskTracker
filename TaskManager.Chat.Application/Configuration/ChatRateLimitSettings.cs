namespace TaskManager.Chat.Application.Configuration
{
    public class ChatRateLimitSettings
    {
        public int MessagesPerMinutePerUser { get; set; } = 30;
        public int MessagesPerMinutePerWorkspace { get; set; } = 300;
        public int Burst { get; set; } = 10;
    }
}
