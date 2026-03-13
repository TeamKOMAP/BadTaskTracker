namespace TaskManager.Application.Realtime;

public interface IChatRealtimeNotifier
{
    Task MessageCreatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default);
    Task MessageUpdatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default);
    Task MessageDeletedAsync(ChatMessageDeletedRealtimeEvent payload, CancellationToken ct = default);
    Task ReadStateUpdatedAsync(ChatReadStateRealtimeEvent payload, CancellationToken ct = default);
    Task AttachmentUploadedAsync(ChatAttachmentRealtimeEvent payload, CancellationToken ct = default);
    Task AttachmentDeletedAsync(ChatAttachmentDeletedRealtimeEvent payload, CancellationToken ct = default);
}

public sealed class NoOpChatRealtimeNotifier : IChatRealtimeNotifier
{
    public Task MessageCreatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default) => Task.CompletedTask;
    public Task MessageUpdatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default) => Task.CompletedTask;
    public Task MessageDeletedAsync(ChatMessageDeletedRealtimeEvent payload, CancellationToken ct = default) => Task.CompletedTask;
    public Task ReadStateUpdatedAsync(ChatReadStateRealtimeEvent payload, CancellationToken ct = default) => Task.CompletedTask;
    public Task AttachmentUploadedAsync(ChatAttachmentRealtimeEvent payload, CancellationToken ct = default) => Task.CompletedTask;
    public Task AttachmentDeletedAsync(ChatAttachmentDeletedRealtimeEvent payload, CancellationToken ct = default) => Task.CompletedTask;
}

public sealed record ChatMessageRealtimeEvent(
    Guid ChatId,
    long MessageId,
    int SenderUserId,
    int Kind,
    string BodyCipher,
    long? ReplyToMessageId,
    long? ForwardedFromMessageId,
    DateTime CreatedAtUtc,
    DateTime? EditedAtUtc,
    DateTime? DeletedAtUtc);

public sealed record ChatMessageDeletedRealtimeEvent(
    Guid ChatId,
    long MessageId,
    DateTime DeletedAtUtc);

public sealed record ChatReadStateRealtimeEvent(
    Guid ChatId,
    int UserId,
    long LastReadMessageId,
    DateTime ReadAtUtc);

public sealed record ChatAttachmentRealtimeEvent(
    Guid ChatId,
    Guid AttachmentId,
    long MessageId,
    string FileName,
    string ContentType,
    long Size,
    int? DurationMs,
    DateTime UploadedAtUtc);

public sealed record ChatAttachmentDeletedRealtimeEvent(
    Guid ChatId,
    Guid AttachmentId,
    long MessageId,
    DateTime DeletedAtUtc);
