namespace TaskManager.Application.Services;

public interface IChatPreferenceService
{
    Task<ChatPreferenceDto> GetAsync(Guid chatId, int userId, CancellationToken ct = default);
    Task<ChatPreferenceDto> UpdateAsync(Guid chatId, int userId, UpdateChatPreferenceRequest request, CancellationToken ct = default);
}

public sealed class ChatPreferenceDto
{
    public Guid ChatId { get; set; }
    public bool IsMuted { get; set; }
    public bool SoundEnabled { get; set; } = true;
    public string? BackgroundImageKey { get; set; }
}

public sealed class UpdateChatPreferenceRequest
{
    public bool? IsMuted { get; set; }
    public bool? SoundEnabled { get; set; }
    public string? BackgroundImageKey { get; set; }
}
