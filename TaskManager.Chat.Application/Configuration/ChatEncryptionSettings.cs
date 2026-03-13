namespace TaskManager.Chat.Application.Configuration
{
    public class ChatEncryptionSettings
    {
        public bool Enabled { get; set; } = false;
        public string Algorithm { get; set; } = "AES-GCM";
        public string KeyId { get; set; } = string.Empty;
    }
}
