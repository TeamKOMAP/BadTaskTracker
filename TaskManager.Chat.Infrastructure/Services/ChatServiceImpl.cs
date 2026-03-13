using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Services;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Chat.Infrastructure.Services;

public sealed class ChatServiceImpl : IChatService
{
    private readonly IChatRepository _chatRepository;
    private readonly IChatRoomMemberRepository _memberRepository;
    private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
    private readonly ITaskRepository _taskRepository;
    private readonly IUserRepository _userRepository;

    public ChatServiceImpl(
        IChatRepository chatRepository,
        IChatRoomMemberRepository memberRepository,
        IWorkspaceMemberRepository workspaceMemberRepository,
        ITaskRepository taskRepository,
        IUserRepository userRepository)
    {
        _chatRepository = chatRepository;
        _memberRepository = memberRepository;
        _workspaceMemberRepository = workspaceMemberRepository;
        _taskRepository = taskRepository;
        _userRepository = userRepository;
    }

    public async Task<List<ChatRoomDto>> GetChatsAsync(int workspaceId, int userId, CancellationToken ct = default)
    {
        if (!await _workspaceMemberRepository.IsMemberAsync(workspaceId, userId))
        {
            throw new ForbiddenException("User is not a member of this workspace");
        }

        var chats = await _chatRepository.GetByWorkspaceIdAsync(workspaceId, userId, ct);
        return chats.Select(MapToDto).ToList();
    }

    public async Task<ChatRoomDto> GetChatAsync(Guid chatId, int userId, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        return MapToDto(chat);
    }

    public async Task<ChatRoomDto> CreateGroupChatAsync(int workspaceId, string title, int creatorUserId, CancellationToken ct = default)
    {
        _ = await _workspaceMemberRepository.GetMemberAsync(workspaceId, creatorUserId)
            ?? throw new ForbiddenException("User is not a member of this workspace");

        var chat = new ChatRoom
        {
            Id = Guid.NewGuid(),
            WorkspaceId = workspaceId,
            Type = ChatRoomType.Group,
            Title = title,
            CreatedByUserId = creatorUserId,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        await _chatRepository.AddAsync(chat, ct);

        await _memberRepository.AddMemberAsync(new ChatRoomMember
        {
            ChatRoomId = chat.Id,
            UserId = creatorUserId,
            Role = ChatMemberRole.GroupOwner,
            JoinedAtUtc = DateTime.UtcNow
        }, ct);

        return MapToDto(chat);
    }

    public async Task<ChatRoomDto> CreateDirectChatAsync(int workspaceId, int currentUserId, int otherUserId, CancellationToken ct = default)
    {
        if (currentUserId == otherUserId)
        {
            throw new ValidationException("Cannot create direct chat with yourself");
        }

        if (!await _workspaceMemberRepository.IsMemberAsync(workspaceId, currentUserId))
        {
            throw new ForbiddenException("User is not a member of this workspace");
        }

        if (!await _workspaceMemberRepository.IsMemberAsync(workspaceId, otherUserId))
        {
            throw new NotFoundException("Other user is not a member of this workspace");
        }

        var directKey = ChatRoom.BuildDirectKey(currentUserId, otherUserId);
        var existingChat = await _chatRepository.GetDirectChatAsync(workspaceId, currentUserId, otherUserId, ct);
        if (existingChat != null)
        {
            return MapToDto(existingChat);
        }

        var otherUser = await _userRepository.GetByIdAsync(otherUserId)
            ?? throw new NotFoundException("User not found");

        var chat = new ChatRoom
        {
            Id = Guid.NewGuid(),
            WorkspaceId = workspaceId,
            Type = ChatRoomType.Direct,
            Title = otherUser.Name,
            DirectKey = directKey,
            CreatedByUserId = currentUserId,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        await _chatRepository.AddAsync(chat, ct);

        await _memberRepository.AddMemberAsync(new ChatRoomMember
        {
            ChatRoomId = chat.Id,
            UserId = currentUserId,
            Role = ChatMemberRole.Member,
            JoinedAtUtc = DateTime.UtcNow
        }, ct);

        await _memberRepository.AddMemberAsync(new ChatRoomMember
        {
            ChatRoomId = chat.Id,
            UserId = otherUserId,
            Role = ChatMemberRole.Member,
            JoinedAtUtc = DateTime.UtcNow
        }, ct);

        return MapToDto(chat);
    }

    public async Task<ChatRoomDto> OpenTaskChatAsync(int taskId, int workspaceId, int userId, CancellationToken ct = default)
    {
        if (!await _workspaceMemberRepository.IsMemberAsync(workspaceId, userId))
        {
            throw new ForbiddenException("User is not a member of this workspace");
        }

        var existingChat = await _chatRepository.GetByTaskIdAsync(taskId, ct);

        if (existingChat != null)
        {
            return MapToDto(existingChat);
        }

        var task = await _taskRepository.GetByIdAsync(taskId, workspaceId)
            ?? throw new NotFoundException("Task not found");

        var chat = new ChatRoom
        {
            Id = Guid.NewGuid(),
            WorkspaceId = workspaceId,
            Type = ChatRoomType.Task,
            Title = $"Task: {task.Title}",
            TaskId = taskId,
            CreatedByUserId = userId,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        await _chatRepository.AddAsync(chat, ct);

        await _memberRepository.AddMemberAsync(new ChatRoomMember
        {
            ChatRoomId = chat.Id,
            UserId = userId,
            Role = ChatMemberRole.Member,
            JoinedAtUtc = DateTime.UtcNow
        }, ct);

        if (task.AssigneeId.HasValue && task.AssigneeId != userId)
        {
            await _memberRepository.AddMemberAsync(new ChatRoomMember
            {
                ChatRoomId = chat.Id,
                UserId = task.AssigneeId.Value,
                Role = ChatMemberRole.Member,
                JoinedAtUtc = DateTime.UtcNow
            }, ct);
        }

        return MapToDto(chat);
    }

    public async Task UpdateChatSettingsAsync(Guid chatId, int userId, string? title, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        var member = await _memberRepository.GetMemberAsync(chatId, userId, ct)
            ?? throw new ForbiddenException("User is not a member of this chat");

        var workspaceMember = await _workspaceMemberRepository.GetMemberAsync(chat.WorkspaceId, userId)
            ?? throw new ForbiddenException("User is not a member of this workspace");

        var canEdit = member.Role == ChatMemberRole.GroupOwner
            || (chat.Type == ChatRoomType.General && workspaceMember.Role == WorkspaceRole.Owner);

        if (!canEdit)
        {
            throw new ForbiddenException("User does not have permission to edit this chat");
        }

        if (title != null)
        {
            chat.Title = title;
        }

        chat.UpdatedAtUtc = DateTime.UtcNow;

        await _chatRepository.UpdateAsync(chat, ct);
    }

    public async Task AddMemberAsync(Guid chatId, int userIdToAdd, int currentUserId, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _workspaceMemberRepository.IsMemberAsync(chat.WorkspaceId, userIdToAdd))
        {
            throw new NotFoundException("User is not a member of this workspace");
        }

        var currentMember = await _memberRepository.GetMemberAsync(chatId, currentUserId, ct)
            ?? throw new ForbiddenException("User is not a member of this chat");

        var canAdd = currentMember.Role == ChatMemberRole.GroupOwner
            || (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, currentUserId));

        if (!canAdd)
        {
            throw new ForbiddenException("User does not have permission to add members");
        }

        if (await _memberRepository.IsMemberAsync(chatId, userIdToAdd, ct))
        {
            return;
        }

        await _memberRepository.AddMemberAsync(new ChatRoomMember
        {
            ChatRoomId = chatId,
            UserId = userIdToAdd,
            Role = ChatMemberRole.Member,
            JoinedAtUtc = DateTime.UtcNow
        }, ct);
    }

    public async Task RemoveMemberAsync(Guid chatId, int userIdToRemove, int currentUserId, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        var currentMember = await _memberRepository.GetMemberAsync(chatId, currentUserId, ct)
            ?? throw new ForbiddenException("User is not a member of this chat");

        var isSelfRemove = userIdToRemove == currentUserId;
        var canRemove = isSelfRemove
            || currentMember.Role == ChatMemberRole.GroupOwner
            || (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, currentUserId));

        if (!canRemove)
        {
            throw new ForbiddenException("User does not have permission to remove members");
        }

        if (userIdToRemove == chat.CreatedByUserId)
        {
            throw new ForbiddenException("Cannot remove the chat creator");
        }

        await _memberRepository.RemoveMemberAsync(chatId, userIdToRemove, ct);
    }

    public async Task UpdateMemberRoleAsync(Guid chatId, int userIdToUpdate, ChatMemberRole newRole, int currentUserId, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        var currentMember = await _memberRepository.GetMemberAsync(chatId, currentUserId, ct)
            ?? throw new ForbiddenException("User is not a member of this chat");

        var canUpdate = currentMember.Role == ChatMemberRole.GroupOwner
            || (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, currentUserId));

        if (!canUpdate)
        {
            throw new ForbiddenException("User does not have permission to update roles");
        }

        if (chat.Type != ChatRoomType.Group && chat.Type != ChatRoomType.Direct)
        {
            throw new ForbiddenException("Cannot change role in this chat type");
        }

        await _memberRepository.UpdateRoleAsync(chatId, userIdToUpdate, newRole, ct);
    }

    private async Task<bool> IsWorkspaceAdminAsync(int workspaceId, int userId, CancellationToken ct = default)
    {
        var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, userId);
        return member?.Role == WorkspaceRole.Admin || member?.Role == WorkspaceRole.Owner;
    }

    private static ChatRoomDto MapToDto(ChatRoom chat)
    {
        return new ChatRoomDto
        {
            Id = chat.Id,
            WorkspaceId = chat.WorkspaceId,
            Type = chat.Type,
            Title = chat.Title,
            TaskId = chat.TaskId,
            CreatedByUserId = chat.CreatedByUserId,
            CreatedAtUtc = chat.CreatedAtUtc,
            UpdatedAtUtc = chat.UpdatedAtUtc
        };
    }
}
