using TaskManager.Domain.Enums;

namespace TaskManager.Application.Services;

public interface IChatMessageService
{
    Task<List<ChatMessageDto>> GetMessagesAsync(Guid chatId, int userId, int limit = 50, long? beforeMessageId = null, CancellationToken ct = default);
    Task<ChatMessageDto> SendMessageAsync(Guid chatId, int senderUserId, SendMessageRequest request, CancellationToken ct = default);
    Task<ChatMessageDto> EditMessageAsync(Guid chatId, long messageId, int userId, string? newBodyCipher, CancellationToken ct = default);
    Task DeleteMessageAsync(Guid chatId, long messageId, int userId, CancellationToken ct = default);
    Task<ChatMessageDto> ReplyToMessageAsync(Guid chatId, long messageId, int senderUserId, SendMessageRequest request, CancellationToken ct = default);
    Task<ChatMessageDto> ForwardMessageAsync(Guid chatId, long messageId, int senderUserId, CancellationToken ct = default);
    Task MarkAsReadAsync(Guid chatId, int userId, long lastReadMessageId, CancellationToken ct = default);
}

public class SendMessageRequest
{
    public ChatMessageKind Kind { get; set; } = ChatMessageKind.Text;
    public string? BodyCipher { get; set; }
    public string? ClientMessageId { get; set; }
    public long? ReplyToMessageId { get; set; }
    public long? ForwardedFromMessageId { get; set; }
}

public class ChatMessageDto
{
    public long Id { get; set; }
    public Guid ChatRoomId { get; set; }
    public int SenderUserId { get; set; }
    public ChatMessageKind Kind { get; set; }
    public string BodyCipher { get; set; } = string.Empty;
    public long? ReplyToMessageId { get; set; }
    public long? ForwardedFromMessageId { get; set; }
    public int? ForwardedFromSenderUserId { get; set; }
    public string? ForwardedFromSenderDisplayName { get; set; }
    public string? ClientMessageId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? EditedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
}
