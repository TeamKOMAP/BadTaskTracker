using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Realtime;
using TaskManager.Application.Services;
using TaskManager.Chat.Application.Configuration;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Chat.Infrastructure.Services;

public sealed class ChatMessageServiceImpl : IChatMessageService
{
    private readonly IChatRepository _chatRepository;
    private readonly IChatMessageRepository _messageRepository;
    private readonly IChatRoomMemberRepository _memberRepository;
    private readonly IChatReadStateRepository _readStateRepository;
    private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
    private readonly IUserRepository _userRepository;
    private readonly IChatRealtimeNotifier _chatRealtimeNotifier;
    private readonly ApplicationDbContext _dbContext;
    private readonly ChatSettings _chatSettings;

    public ChatMessageServiceImpl(
        IChatRepository chatRepository,
        IChatMessageRepository messageRepository,
        IChatRoomMemberRepository memberRepository,
        IChatReadStateRepository readStateRepository,
        IWorkspaceMemberRepository workspaceMemberRepository,
        IUserRepository userRepository,
        IChatRealtimeNotifier chatRealtimeNotifier,
        ApplicationDbContext dbContext,
        IOptions<ChatSettings> chatOptions)
    {
        _chatRepository = chatRepository;
        _messageRepository = messageRepository;
        _memberRepository = memberRepository;
        _readStateRepository = readStateRepository;
        _workspaceMemberRepository = workspaceMemberRepository;
        _userRepository = userRepository;
        _chatRealtimeNotifier = chatRealtimeNotifier;
        _dbContext = dbContext;
        _chatSettings = chatOptions.Value;
    }

    public async Task<List<ChatMessageDto>> GetMessagesAsync(Guid chatId, int userId, int limit = 50, long? beforeMessageId = null, CancellationToken ct = default)
    {
        _ = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        var messages = await _messageRepository.GetByChatRoomIdAsync(chatId, limit, beforeMessageId, ct);
        return (await Task.WhenAll(messages.Select(message => MapToDtoAsync(message, ct)))).ToList();
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
                return await MapToDtoAsync(existing, ct);
            }
        }

        var bodyCipher = request.BodyCipher ?? string.Empty;
        ValidateMessageBody(request.Kind, bodyCipher);

        var message = new ChatMessage
        {
            ChatRoomId = chatId,
            SenderUserId = senderUserId,
            Kind = request.Kind,
            BodyCipher = bodyCipher,
            ClientMessageId = request.ClientMessageId,
            ReplyToMessageId = request.ReplyToMessageId,
            ForwardedFromMessageId = request.ForwardedFromMessageId,
            CreatedAtUtc = DateTime.UtcNow
        };

        await _messageRepository.AddAsync(message, ct);

        chat.UpdatedAtUtc = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat, ct);

        try
        {
            await _dbContext.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (!string.IsNullOrWhiteSpace(request.ClientMessageId) && IsUniqueConstraintViolation(ex))
        {
            var existing = await _messageRepository.GetByClientMessageIdAsync(chatId, request.ClientMessageId!, ct);
            if (existing != null)
            {
                return await MapToDtoAsync(existing, ct);
            }

            throw new ConflictException("Message with this clientMessageId already exists.");
        }

        await _chatRealtimeNotifier.MessageCreatedAsync(await ToRealtimeMessageAsync(message, ct), ct);

        return await MapToDtoAsync(message, ct);
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

        var canEdit = message.SenderUserId == userId
            || member.Role == ChatMemberRole.GroupOwner
            || (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, userId, ct));

        if (!canEdit)
        {
            throw new ForbiddenException("User does not have permission to edit this message");
        }

        if (message.DeletedAtUtc != null)
        {
            throw new ForbiddenException("Cannot edit a deleted message");
        }

        if (newBodyCipher != null)
        {
            ValidateMessageBody(message.Kind, newBodyCipher);
        }

        message.BodyCipher = newBodyCipher ?? message.BodyCipher;
        message.EditedAtUtc = DateTime.UtcNow;
        await _messageRepository.UpdateAsync(message, ct);
        await _dbContext.SaveChangesAsync(ct);

        await _chatRealtimeNotifier.MessageUpdatedAsync(await ToRealtimeMessageAsync(message, ct), ct);

        return await MapToDtoAsync(message, ct);
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

        var canDelete = message.SenderUserId == userId
            || member.Role == ChatMemberRole.GroupOwner
            || (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, userId, ct));

        if (!canDelete)
        {
            throw new ForbiddenException("User does not have permission to delete this message");
        }

        message.BodyCipher = "Сообщение удалено";
        message.DeletedAtUtc = DateTime.UtcNow;
        await _messageRepository.UpdateAsync(message, ct);
        await _dbContext.SaveChangesAsync(ct);

        await _chatRealtimeNotifier.MessageDeletedAsync(
            new ChatMessageDeletedRealtimeEvent(chatId, messageId, message.DeletedAtUtc.Value),
            ct);
    }

    public async Task<ChatMessageDto> ReplyToMessageAsync(Guid chatId, long messageId, int senderUserId, SendMessageRequest request, CancellationToken ct = default)
    {
        _ = await _chatRepository.GetByIdAsync(chatId, ct)
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
        _ = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, senderUserId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        var originalMessage = await _messageRepository.GetByIdAsync(messageId, ct)
            ?? throw new NotFoundException("Message to forward not found");

        var hasAccessToSourceMessage = await _memberRepository.IsMemberAsync(originalMessage.ChatRoomId, senderUserId, ct);
        if (!hasAccessToSourceMessage)
        {
            throw new NotFoundException("Message to forward not found");
        }

        if (originalMessage.DeletedAtUtc != null)
        {
            throw new NotFoundException("Message to forward not found");
        }

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
        await _dbContext.SaveChangesAsync(ct);

        await _chatRealtimeNotifier.ReadStateUpdatedAsync(
            new ChatReadStateRealtimeEvent(chatId, userId, lastReadMessageId, DateTime.UtcNow),
            ct);
    }

    private async Task<bool> IsWorkspaceAdminAsync(int workspaceId, int userId, CancellationToken ct = default)
    {
        var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, userId);
        return member?.Role == WorkspaceRole.Admin || member?.Role == WorkspaceRole.Owner;
    }

    private async Task<(int? SenderUserId, string? SenderDisplayName)> ResolveForwardedFromAsync(ChatMessage message, CancellationToken ct)
    {
        if (!message.ForwardedFromMessageId.HasValue || message.ForwardedFromMessageId.Value <= 0)
        {
            return (null, null);
        }

        var originalMessage = await _messageRepository.GetByIdAsync(message.ForwardedFromMessageId.Value, ct);
        if (originalMessage == null)
        {
            return (null, null);
        }

        var originalSender = await _userRepository.GetByIdAsync(originalMessage.SenderUserId);
        return (originalMessage.SenderUserId, originalSender?.Name);
    }

    private async Task<ChatMessageDto> MapToDtoAsync(ChatMessage message, CancellationToken ct)
    {
        var forwardedFrom = await ResolveForwardedFromAsync(message, ct);

        return new ChatMessageDto
        {
            Id = message.Id,
            ChatRoomId = message.ChatRoomId,
            SenderUserId = message.SenderUserId,
            Kind = message.Kind,
            BodyCipher = message.BodyCipher,
            ReplyToMessageId = message.ReplyToMessageId,
            ForwardedFromMessageId = message.ForwardedFromMessageId,
            ForwardedFromSenderUserId = forwardedFrom.SenderUserId,
            ForwardedFromSenderDisplayName = forwardedFrom.SenderDisplayName,
            ClientMessageId = message.ClientMessageId,
            CreatedAtUtc = message.CreatedAtUtc,
            EditedAtUtc = message.EditedAtUtc,
            DeletedAtUtc = message.DeletedAtUtc
        };
    }

    private async Task<ChatMessageRealtimeEvent> ToRealtimeMessageAsync(ChatMessage message, CancellationToken ct)
    {
        var forwardedFrom = await ResolveForwardedFromAsync(message, ct);

        return new ChatMessageRealtimeEvent(
            message.ChatRoomId,
            message.Id,
            message.SenderUserId,
            (int)message.Kind,
            message.BodyCipher,
            message.ReplyToMessageId,
            message.ForwardedFromMessageId,
            forwardedFrom.SenderUserId,
            forwardedFrom.SenderDisplayName,
            message.ClientMessageId,
            message.CreatedAtUtc,
            message.EditedAtUtc,
            message.DeletedAtUtc);
    }

    private void ValidateMessageBody(ChatMessageKind kind, string bodyCipher)
    {
        if (bodyCipher.Length > _chatSettings.MaxMessageLength)
        {
            throw new ValidationException($"Message body exceeds max length of {_chatSettings.MaxMessageLength}.");
        }

        if (kind == ChatMessageKind.Text && string.IsNullOrWhiteSpace(bodyCipher))
        {
            throw new ValidationException("Message body is required.");
        }
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException ex)
    {
        var message = ex.InnerException?.Message ?? ex.Message;
        return message.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase)
               || message.Contains("duplicate key value violates unique constraint", StringComparison.OrdinalIgnoreCase)
               || message.Contains("23505", StringComparison.OrdinalIgnoreCase);
    }
}
