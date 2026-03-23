using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using TaskManager.API.Hubs;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Realtime;

namespace TaskManager.API.Realtime;

public sealed class SignalRChatRealtimeNotifier : IChatRealtimeNotifier
{
    private readonly IHubContext<ChatHub> _hubContext;
    private readonly IServiceScopeFactory _scopeFactory;

    public SignalRChatRealtimeNotifier(IHubContext<ChatHub> hubContext, IServiceScopeFactory scopeFactory)
    {
        _hubContext = hubContext;
        _scopeFactory = scopeFactory;
    }

    public async Task MessageCreatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default)
    {
        await BroadcastToChatUsersAsync(payload.ChatId, "chat.message.created", payload, ct);
    }

    public async Task MessageUpdatedAsync(ChatMessageRealtimeEvent payload, CancellationToken ct = default)
    {
        await BroadcastToChatUsersAsync(payload.ChatId, "chat.message.updated", payload, ct);
    }

    public async Task MessageDeletedAsync(ChatMessageDeletedRealtimeEvent payload, CancellationToken ct = default)
    {
        await BroadcastToChatUsersAsync(payload.ChatId, "chat.message.deleted", payload, ct);
    }

    public async Task ReadStateUpdatedAsync(ChatReadStateRealtimeEvent payload, CancellationToken ct = default)
    {
        await BroadcastToChatUsersAsync(payload.ChatId, "chat.read.updated", payload, ct);
    }

    public async Task AttachmentUploadedAsync(ChatAttachmentRealtimeEvent payload, CancellationToken ct = default)
    {
        await BroadcastToChatUsersAsync(payload.ChatId, "chat.attachment.uploaded", payload, ct);
    }

    public async Task AttachmentDeletedAsync(ChatAttachmentDeletedRealtimeEvent payload, CancellationToken ct = default)
    {
        await BroadcastToChatUsersAsync(payload.ChatId, "chat.attachment.deleted", payload, ct);
    }

    private async Task BroadcastToChatUsersAsync(Guid chatId, string method, object payload, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var memberRepository = scope.ServiceProvider.GetRequiredService<IChatRoomMemberRepository>();
        var userIds = await memberRepository.GetUserIdsByChatRoomIdAsync(chatId, ct);
        if (userIds.Count == 0)
        {
            return;
        }

        var groups = userIds
            .Distinct()
            .Select(ChatHub.BuildUserGroupName)
            .ToArray();

        await _hubContext.Clients.Groups(groups).SendAsync(method, payload, ct);
    }
}
