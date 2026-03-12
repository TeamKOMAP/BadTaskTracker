using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
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

public class ChatMessageService : IChatMessageService
{
    private readonly IChatRepository _chatRepository;
    private readonly IChatMessageRepository _messageRepository;
    private readonly IChatRoomMemberRepository _memberRepository;
    private readonly IChatReadStateRepository _readStateRepository;
    private readonly IWorkspaceMemberRepository _workspaceMemberRepository;

    public ChatMessageService(
        IChatRepository chatRepository,
        IChatMessageRepository messageRepository,
        IChatRoomMemberRepository memberRepository,
        IChatReadStateRepository readStateRepository,
        IWorkspaceMemberRepository workspaceMemberRepository)
    {
        _chatRepository = chatRepository;
        _messageRepository = messageRepository;
        _memberRepository = memberRepository;
        _readStateRepository = readStateRepository;
        _workspaceMemberRepository = workspaceMemberRepository;
    }

    public async Task<List<ChatMessageDto>> GetMessagesAsync(Guid chatId, int userId, int limit = 50, long? beforeMessageId = null, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        var messages = await _messageRepository.GetByChatRoomIdAsync(chatId, limit, beforeMessageId, ct);
        return messages.Select(MapToDto).ToList();
    }

    public async Task<ChatMessageDto> SendMessageAsync(Guid chatId, int senderUserId, SendMessageRequest request, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, senderUserId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        if (!string.IsNullOrEmpty(request.ClientMessageId))
        {
            var existing = await _messageRepository.GetByClientMessageIdAsync(chatId, request.ClientMessageId, ct);
            if (existing != null)
            {
                return MapToDto(existing);
            }
        }

        var message = new ChatMessage
        {
            ChatRoomId = chatId,
            SenderUserId = senderUserId,
            Kind = request.Kind,
            BodyCipher = request.BodyCipher ?? string.Empty,
            ClientMessageId = request.ClientMessageId,
            ReplyToMessageId = request.ReplyToMessageId,
            CreatedAtUtc = DateTime.UtcNow
        };

        await _messageRepository.AddAsync(message, ct);

        chat.UpdatedAtUtc = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat, ct);

        return MapToDto(message);
    }

    public async Task<ChatMessageDto> EditMessageAsync(Guid chatId, long messageId, int userId, string? newBodyCipher, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        var message = await _messageRepository.GetByIdAsync(messageId, ct)
            ?? throw new NotFoundException("Message not found");

        if (message.ChatRoomId != chatId)
        {
            throw new NotFoundException("Message not found in this chat");
        }

        var member = await _memberRepository.GetMemberAsync(chatId, userId, ct)
            ?? throw new ForbiddenException("User is not a member of this chat");

        var canEdit = message.SenderUserId == userId ||
            member.Role == ChatMemberRole.GroupOwner ||
            (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, userId, ct));

        if (!canEdit)
        {
            throw new ForbiddenException("User does not have permission to edit this message");
        }

        if (message.DeletedAtUtc != null)
        {
            throw new ForbiddenException("Cannot edit a deleted message");
        }

        message.BodyCipher = newBodyCipher ?? message.BodyCipher;
        message.EditedAtUtc = DateTime.UtcNow;
        await _messageRepository.UpdateAsync(message, ct);

        return MapToDto(message);
    }

    public async Task DeleteMessageAsync(Guid chatId, long messageId, int userId, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        var message = await _messageRepository.GetByIdAsync(messageId, ct)
            ?? throw new NotFoundException("Message not found");

        if (message.ChatRoomId != chatId)
        {
            throw new NotFoundException("Message not found in this chat");
        }

        var member = await _memberRepository.GetMemberAsync(chatId, userId, ct)
            ?? throw new ForbiddenException("User is not a member of this chat");

        var canDelete = message.SenderUserId == userId ||
            member.Role == ChatMemberRole.GroupOwner ||
            (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, userId, ct));

        if (!canDelete)
        {
            throw new ForbiddenException("User does not have permission to delete this message");
        }

        message.BodyCipher = "Сообщение удалено";
        message.DeletedAtUtc = DateTime.UtcNow;
        await _messageRepository.UpdateAsync(message, ct);
    }

    public async Task<ChatMessageDto> ReplyToMessageAsync(Guid chatId, long messageId, int senderUserId, SendMessageRequest request, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, senderUserId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        var replyToMessage = await _messageRepository.GetByIdAsync(messageId, ct)
            ?? throw new NotFoundException("Message to reply to not found");

        if (replyToMessage.ChatRoomId != chatId)
        {
            throw new NotFoundException("Message to reply to not found in this chat");
        }

        request.ReplyToMessageId = messageId;
        return await SendMessageAsync(chatId, senderUserId, request, ct);
    }

    public async Task<ChatMessageDto> ForwardMessageAsync(Guid chatId, long messageId, int senderUserId, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, senderUserId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        var originalMessage = await _messageRepository.GetByIdAsync(messageId, ct)
            ?? throw new NotFoundException("Message to forward not found");

        var request = new SendMessageRequest
        {
            Kind = originalMessage.Kind,
            BodyCipher = originalMessage.BodyCipher,
            ForwardedFromMessageId = messageId
        };

        return await SendMessageAsync(chatId, senderUserId, request, ct);
    }

    public async Task MarkAsReadAsync(Guid chatId, int userId, long lastReadMessageId, CancellationToken ct = default)
    {
        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        await _readStateRepository.SetAsync(chatId, userId, lastReadMessageId, ct);
    }

    private async Task<bool> IsWorkspaceAdminAsync(int workspaceId, int userId, CancellationToken ct = default)
    {
        var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, userId);
        return member?.Role == WorkspaceRole.Admin || member?.Role == WorkspaceRole.Owner;
    }

    private static ChatMessageDto MapToDto(ChatMessage message)
    {
        return new ChatMessageDto
        {
            Id = message.Id,
            ChatRoomId = message.ChatRoomId,
            SenderUserId = message.SenderUserId,
            Kind = message.Kind,
            BodyCipher = message.BodyCipher,
            ReplyToMessageId = message.ReplyToMessageId,
            ForwardedFromMessageId = message.ForwardedFromMessageId,
            ClientMessageId = message.ClientMessageId,
            CreatedAtUtc = message.CreatedAtUtc,
            EditedAtUtc = message.EditedAtUtc,
            DeletedAtUtc = message.DeletedAtUtc
        };
    }
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
    public string? ClientMessageId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? EditedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
}
