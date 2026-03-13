using Microsoft.AspNetCore.SignalR;
using TaskManager.API.Hubs;
using TaskManager.Application.Realtime;

namespace TaskManager.API.Realtime;

public sealed class SignalRChatRealtimeNotifier : IChatRealtimeNotifier
{
    private readonly IHubContext<ChatHub> _hubContext;

    public SignalRChatRealtimeNotifier(IHubContext<ChatHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public Task MessageCreatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default)
    {
        return _hubContext.Clients
            .Group(ChatHub.BuildGroupName(payload.ChatId))
            .SendAsync("chat.message.created", payload, ct);
    }

    public Task MessageUpdatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default)
    {
        return _hubContext.Clients
            .Group(ChatHub.BuildGroupName(payload.ChatId))
            .SendAsync("chat.message.updated", payload, ct);
    }

    public Task MessageDeletedAsync(ChatMessageDeletedRealtimeEvent payload, CancellationToken ct = default)
    {
        return _hubContext.Clients
            .Group(ChatHub.BuildGroupName(payload.ChatId))
            .SendAsync("chat.message.deleted", payload, ct);
    }

    public Task ReadStateUpdatedAsync(ChatReadStateRealtimeEvent payload, CancellationToken ct = default)
    {
        return _hubContext.Clients
            .Group(ChatHub.BuildGroupName(payload.ChatId))
            .SendAsync("chat.read.updated", payload, ct);
    }

    public Task AttachmentUploadedAsync(ChatAttachmentRealtimeEvent payload, CancellationToken ct = default)
    {
        return _hubContext.Clients
            .Group(ChatHub.BuildGroupName(payload.ChatId))
            .SendAsync("chat.attachment.uploaded", payload, ct);
    }

    public Task AttachmentDeletedAsync(ChatAttachmentDeletedRealtimeEvent payload, CancellationToken ct = default)
    {
        return _hubContext.Clients
            .Group(ChatHub.BuildGroupName(payload.ChatId))
            .SendAsync("chat.attachment.deleted", payload, ct);
    }
}
