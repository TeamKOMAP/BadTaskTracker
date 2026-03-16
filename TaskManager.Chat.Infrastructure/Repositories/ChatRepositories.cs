using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Chat.Infrastructure.Repositories;

public class ChatRepository : IChatRepository
{
    private readonly ApplicationDbContext _db;

    public ChatRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<ChatRoom?> GetByIdAsync(Guid chatId, CancellationToken ct = default)
    {
        return await _db.ChatRooms
            .Include(c => c.Workspace)
            .FirstOrDefaultAsync(c => c.Id == chatId, ct);
    }

    public async Task<ChatRoom?> GetByIdWithMembersAsync(Guid chatId, CancellationToken ct = default)
    {
        return await _db.ChatRooms
            .Include(c => c.Members)
            .FirstOrDefaultAsync(c => c.Id == chatId, ct);
    }

    public async Task<List<ChatRoom>> GetByWorkspaceIdAsync(int workspaceId, int userId, CancellationToken ct = default)
    {
        return await _db.ChatRooms
            .Where(c => c.WorkspaceId == workspaceId && c.Members.Any(m => m.UserId == userId))
            .OrderByDescending(c => c.UpdatedAtUtc)
            .ToListAsync(ct);
    }

    public async Task<ChatRoom?> GetByTaskIdAsync(int taskId, CancellationToken ct = default)
    {
        return await _db.ChatRooms
            .FirstOrDefaultAsync(c => c.TaskId == taskId && c.Type == ChatRoomType.Task, ct);
    }

    public async Task<ChatRoom?> GetGeneralChatAsync(int workspaceId, CancellationToken ct = default)
    {
        return await _db.ChatRooms
            .FirstOrDefaultAsync(c => c.WorkspaceId == workspaceId && c.Type == ChatRoomType.General, ct);
    }

    public async Task<ChatRoom?> GetDirectChatAsync(int workspaceId, int userId1, int userId2, CancellationToken ct = default)
    {
        var directKey = ChatRoom.BuildDirectKey(userId1, userId2);

        var directChat = await _db.ChatRooms
            .Where(c => c.WorkspaceId == workspaceId && c.Type == ChatRoomType.Direct)
            .Where(c => c.DirectKey == directKey)
            .OrderByDescending(c => c.UpdatedAtUtc)
            .FirstOrDefaultAsync(ct);

        if (directChat != null)
        {
            return directChat;
        }

        return await _db.ChatRooms
            .Where(c => c.WorkspaceId == workspaceId && c.Type == ChatRoomType.Direct)
            .Where(c => c.DirectKey == null)
            .Where(c => c.Members.Any(m => m.UserId == userId1))
            .Where(c => c.Members.Any(m => m.UserId == userId2))
            .Where(c => c.Members.Count == 2)
            .OrderByDescending(c => c.UpdatedAtUtc)
            .FirstOrDefaultAsync(ct);
    }

    public Task<ChatRoom> AddAsync(ChatRoom chatRoom, CancellationToken ct = default)
    {
        _db.ChatRooms.Add(chatRoom);
        return Task.FromResult(chatRoom);
    }

    public Task UpdateAsync(ChatRoom chatRoom, CancellationToken ct = default)
    {
        _db.ChatRooms.Update(chatRoom);
        return Task.CompletedTask;
    }

    public async Task<bool> ExistsAsync(Guid chatId, CancellationToken ct = default)
    {
        return await _db.ChatRooms.AnyAsync(c => c.Id == chatId, ct);
    }
}

public class ChatRoomMemberRepository : IChatRoomMemberRepository
{
    private readonly ApplicationDbContext _db;

    public ChatRoomMemberRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<ChatRoomMember?> GetMemberAsync(Guid chatRoomId, int userId, CancellationToken ct = default)
    {
        return await _db.ChatRoomMembers
            .FirstOrDefaultAsync(m => m.ChatRoomId == chatRoomId && m.UserId == userId, ct);
    }

    public async Task<List<ChatRoomMember>> GetMembersByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default)
    {
        return await _db.ChatRoomMembers
            .Include(m => m.User)
            .Where(m => m.ChatRoomId == chatRoomId)
            .ToListAsync(ct);
    }

    public async Task<List<int>> GetUserIdsByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default)
    {
        return await _db.ChatRoomMembers
            .Where(m => m.ChatRoomId == chatRoomId)
            .Select(m => m.UserId)
            .ToListAsync(ct);
    }

    public async Task<bool> IsMemberAsync(Guid chatRoomId, int userId, CancellationToken ct = default)
    {
        return await _db.ChatRoomMembers.AnyAsync(m => m.ChatRoomId == chatRoomId && m.UserId == userId, ct);
    }

    public Task AddMemberAsync(ChatRoomMember member, CancellationToken ct = default)
    {
        _db.ChatRoomMembers.Add(member);
        return Task.CompletedTask;
    }

    public async Task RemoveMemberAsync(Guid chatRoomId, int userId, CancellationToken ct = default)
    {
        var member = await _db.ChatRoomMembers
            .FirstOrDefaultAsync(m => m.ChatRoomId == chatRoomId && m.UserId == userId, ct);
        if (member != null)
        {
            _db.ChatRoomMembers.Remove(member);
        }
    }

    public async Task UpdateRoleAsync(Guid chatRoomId, int userId, ChatMemberRole role, CancellationToken ct = default)
    {
        var member = await _db.ChatRoomMembers
            .FirstOrDefaultAsync(m => m.ChatRoomId == chatRoomId && m.UserId == userId, ct);
        if (member != null)
        {
            member.Role = role;
        }
    }
}

public class ChatMessageRepository : IChatMessageRepository
{
    private readonly ApplicationDbContext _db;

    public ChatMessageRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<ChatMessage?> GetByIdAsync(long messageId, CancellationToken ct = default)
    {
        return await _db.ChatMessages
            .Include(m => m.SenderUser)
            .FirstOrDefaultAsync(m => m.Id == messageId, ct);
    }

    public async Task<List<ChatMessage>> GetByChatRoomIdAsync(Guid chatRoomId, int limit, long? beforeMessageId = null, CancellationToken ct = default)
    {
        var query = _db.ChatMessages
            .Include(m => m.SenderUser)
            .Where(m => m.ChatRoomId == chatRoomId);

        if (beforeMessageId.HasValue)
        {
            var beforeMessage = await _db.ChatMessages.FindAsync(new object[] { beforeMessageId.Value }, ct);
            if (beforeMessage != null)
            {
                query = query.Where(m => m.CreatedAtUtc < beforeMessage.CreatedAtUtc);
            }
        }

        return await query
            .OrderByDescending(m => m.CreatedAtUtc)
            .Take(limit)
            .ToListAsync(ct);
    }

    public Task<ChatMessage> AddAsync(ChatMessage message, CancellationToken ct = default)
    {
        _db.ChatMessages.Add(message);
        return Task.FromResult(message);
    }

    public Task UpdateAsync(ChatMessage message, CancellationToken ct = default)
    {
        _db.ChatMessages.Update(message);
        return Task.CompletedTask;
    }

    public async Task<long> GetCountByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default)
    {
        return await _db.ChatMessages.CountAsync(m => m.ChatRoomId == chatRoomId, ct);
    }

    public async Task<ChatMessage?> GetByClientMessageIdAsync(Guid chatRoomId, string clientMessageId, CancellationToken ct = default)
    {
        return await _db.ChatMessages
            .FirstOrDefaultAsync(m => m.ChatRoomId == chatRoomId && m.ClientMessageId == clientMessageId, ct);
    }
}

public class ChatMessageAttachmentRepository : IChatMessageAttachmentRepository
{
    private readonly ApplicationDbContext _db;

    public ChatMessageAttachmentRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<ChatMessageAttachment?> GetByIdAsync(Guid attachmentId, CancellationToken ct = default)
    {
        return await _db.ChatMessageAttachments.FindAsync(new object[] { attachmentId }, ct);
    }

    public async Task<List<ChatMessageAttachment>> GetByMessageIdAsync(long messageId, CancellationToken ct = default)
    {
        return await _db.ChatMessageAttachments
            .Where(a => a.MessageId == messageId)
            .ToListAsync(ct);
    }

    public Task<ChatMessageAttachment> AddAsync(ChatMessageAttachment attachment, CancellationToken ct = default)
    {
        _db.ChatMessageAttachments.Add(attachment);
        return Task.FromResult(attachment);
    }

    public async Task DeleteAsync(Guid attachmentId, CancellationToken ct = default)
    {
        var attachment = await _db.ChatMessageAttachments.FindAsync(new object[] { attachmentId }, ct);
        if (attachment != null)
        {
            _db.ChatMessageAttachments.Remove(attachment);
        }
    }
}

public class ChatReadStateRepository : IChatReadStateRepository
{
    private readonly ApplicationDbContext _db;

    public ChatReadStateRepository(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<ChatReadState?> GetAsync(Guid chatRoomId, int userId, CancellationToken ct = default)
    {
        return await _db.ChatReadStates
            .FirstOrDefaultAsync(r => r.ChatRoomId == chatRoomId && r.UserId == userId, ct);
    }

    public async Task SetAsync(Guid chatRoomId, int userId, long lastReadMessageId, CancellationToken ct = default)
    {
        var existing = await _db.ChatReadStates
            .FirstOrDefaultAsync(r => r.ChatRoomId == chatRoomId && r.UserId == userId, ct);

        if (existing != null)
        {
            existing.LastReadMessageId = lastReadMessageId;
        }
        else
        {
            _db.ChatReadStates.Add(new ChatReadState
            {
                ChatRoomId = chatRoomId,
                UserId = userId,
                LastReadMessageId = lastReadMessageId
            });
        }
    }

    public async Task<List<ChatReadState>> GetByUserIdAsync(int userId, CancellationToken ct = default)
    {
        return await _db.ChatReadStates
            .Where(r => r.UserId == userId)
            .ToListAsync(ct);
    }

    public async Task<List<ChatReadState>> GetByChatRoomIdAsync(Guid chatRoomId, CancellationToken ct = default)
    {
        return await _db.ChatReadStates
            .Where(r => r.ChatRoomId == chatRoomId)
            .ToListAsync(ct);
    }
}
