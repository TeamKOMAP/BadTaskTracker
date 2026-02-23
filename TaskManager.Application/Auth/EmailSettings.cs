namespace TaskManager.Application.Auth
{
    public class EmailSettings
    {
        public string Provider { get; set; } = "Smtp";
        public HttpApiEmailSettings HttpApi { get; set; } = new();
    }

    public class HttpApiEmailSettings
    {
        public string Provider { get; set; } = "Resend";
        public string BaseUrl { get; set; } = "https://api.resend.com";
        public string SendPath { get; set; } = "/emails";
        public string ApiKey { get; set; } = string.Empty;
        public string FromEmail { get; set; } = string.Empty;
        public string FromName { get; set; } = "BadTaskTracker";
        public int TimeoutSeconds { get; set; } = 10;
    }
}
