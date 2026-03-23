using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces;

public interface IChatRepository
{
    Task<ChatRoom?> GetByIdAsync(Guid chatId, CancellationToken ct = default);
    Task<ChatRoom?> GetByIdWithMembersAsync(Guid chatId, CancellationToken ct = default);
    Task<List<ChatRoom>> GetByWorkspaceIdAsync(int workspaceId, int userId, CancellationToken ct = default);
    Task<ChatRoom?> GetByTaskIdAsync(int taskId, CancellationToken ct = default);
    Task<ChatRoom?> GetGeneralChatAsync(int workspaceId, CancellationToken ct = default);
    Task<ChatRoom?> GetDirectChatAsync(int workspaceId, int userId1, int userId2, CancellationToken ct = default);
    Task<ChatRoom> AddAsync(ChatRoom chatRoom, CancellationToken ct = default);
    Task UpdateAsync(ChatRoom chatRoom, CancellationToken ct = default);
    Task DeleteAsync(ChatRoom chatRoom, CancellationToken ct = default);
    Task<bool> ExistsAsync(Guid chatId, CancellationToken ct = default);
}

public interface IChatRoomMemberRepository
{
    Task<ChatRoomMember?> GetMemberAsync(Guid chatRoomId, int userId, CancellationToken ct = default);
    Task<List<ChatRoomMember>> GetMembersByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default);
    Task<List<int>> GetUserIdsByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default);
    Task<bool> IsMemberAsync(Guid chatRoomId, int userId, CancellationToken ct = default);
    Task AddMemberAsync(ChatRoomMember member, CancellationToken ct = default);
    Task RemoveMemberAsync(Guid chatRoomId, int userId, CancellationToken ct = default);
    Task UpdateRoleAsync(Guid chatRoomId, int userId, Domain.Enums.ChatMemberRole role, CancellationToken ct = default);
}

public interface IChatMessageRepository
{
    Task<ChatMessage?> GetByIdAsync(long messageId, CancellationToken ct = default);
    Task<List<ChatMessage>> GetByChatRoomIdAsync(Guid chatRoomId, int limit, long? beforeMessageId = null, CancellationToken ct = default);
    Task<ChatMessage> AddAsync(ChatMessage message, CancellationToken ct = default);
    Task UpdateAsync(ChatMessage message, CancellationToken ct = default);
    Task<long> GetCountByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default);
    Task<int> GetUnreadCountByChatRoomIdAsync(Guid chatRoomId, int userId, long lastReadMessageId, CancellationToken ct = default);
    Task<ChatMessage?> GetByClientMessageIdAsync(Guid chatRoomId, string clientMessageId, CancellationToken ct = default);
}

public interface IChatMessageAttachmentRepository
{
    Task<ChatMessageAttachment?> GetByIdAsync(Guid attachmentId, CancellationToken ct = default);
    Task<List<ChatMessageAttachment>> GetByMessageIdAsync(long messageId, CancellationToken ct = default);
    Task<List<ChatMessageAttachment>> GetByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default);
    Task<ChatMessageAttachment> AddAsync(ChatMessageAttachment attachment, CancellationToken ct = default);
    Task DeleteAsync(Guid attachmentId, CancellationToken ct = default);
}

public interface IChatReadStateRepository
{
    Task<ChatReadState?> GetAsync(Guid chatRoomId, int userId, CancellationToken ct = default);
    Task SetAsync(Guid chatRoomId, int userId, long lastReadMessageId, CancellationToken ct = default);
    Task<List<ChatReadState>> GetByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default);
    Task<List<ChatReadState>> GetByUserIdAsync(int userId, CancellationToken ct = default);
}
