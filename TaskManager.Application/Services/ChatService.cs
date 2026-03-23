using TaskManager.Domain.Enums;

namespace TaskManager.Application.Services;

public interface IChatService
{
    Task<List<ChatRoomDto>> GetChatsAsync(int workspaceId, int userId, CancellationToken ct = default);
    Task<ChatRoomDto> GetChatAsync(Guid chatId, int userId, CancellationToken ct = default);
    Task<ChatRoomDto> CreateGroupChatAsync(int workspaceId, string title, int creatorUserId, CancellationToken ct = default);
    Task<ChatRoomDto> CreateDirectChatAsync(int workspaceId, int currentUserId, int otherUserId, CancellationToken ct = default);
    Task<ChatRoomDto> OpenTaskChatAsync(int taskId, int workspaceId, int userId, CancellationToken ct = default);
    Task UpdateChatSettingsAsync(Guid chatId, int userId, string? title, CancellationToken ct = default);
    Task AddMemberAsync(Guid chatId, int userIdToAdd, int currentUserId, CancellationToken ct = default);
    Task RemoveMemberAsync(Guid chatId, int userIdToRemove, int currentUserId, CancellationToken ct = default);
    Task UpdateMemberRoleAsync(Guid chatId, int userIdToUpdate, ChatMemberRole newRole, int currentUserId, CancellationToken ct = default);
}

public class ChatRoomDto
{
    public Guid Id { get; set; }
    public int WorkspaceId { get; set; }
    public ChatRoomType Type { get; set; }
    public string? Title { get; set; }
    public int? TaskId { get; set; }
    public int? DirectPeerUserId { get; set; }
    public string? DirectPeerDisplayName { get; set; }
    public int CreatedByUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
    public int UnreadCount { get; set; }
}
