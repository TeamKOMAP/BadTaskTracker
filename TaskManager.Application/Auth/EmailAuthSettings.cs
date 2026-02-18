namespace TaskManager.Application.Auth
{
    public class EmailAuthSettings
    {
        public int CodeLength { get; set; } = 6;
        public int CodeLifetimeMinutes { get; set; } = 10;
        public int ResendCooldownSeconds { get; set; } = 60;
        public int MaxAttempts { get; set; } = 5;
        public string SenderName { get; set; } = "BadTaskTracker";
        public bool EnableDevelopmentCodeFallback { get; set; } = false;
        public bool ExposeDevelopmentCodeInResponse { get; set; } = false;
    }
}
