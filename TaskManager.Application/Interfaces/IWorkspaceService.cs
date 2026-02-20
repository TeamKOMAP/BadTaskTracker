using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface IWorkspaceService
    {
        Task<IEnumerable<WorkspaceDto>> GetWorkspacesAsync(int actorUserId);
        Task<WorkspaceDto> GetWorkspaceAsync(int actorUserId, int workspaceId);
        Task<WorkspaceDto> CreateWorkspaceAsync(int actorUserId, CreateWorkspaceDto dto);
        Task<WorkspaceDto> UpdateWorkspaceAsync(int actorUserId, int workspaceId, UpdateWorkspaceDto dto);
        Task<string?> GetAvatarObjectKeyAsync(int actorUserId, int workspaceId);
        Task<WorkspaceDto> SetAvatarAsync(int actorUserId, int workspaceId, string avatarPath, string avatarObjectKey);
        Task<WorkspaceDto> ClearAvatarAsync(int actorUserId, int workspaceId);
        Task<IEnumerable<WorkspaceMemberDto>> GetMembersAsync(int actorUserId, int workspaceId);
        Task<WorkspaceMemberDto> AddMemberAsync(int actorUserId, int workspaceId, AddWorkspaceMemberDto dto);
        Task RemoveMemberAsync(int actorUserId, int workspaceId, int memberUserId);
    }
}
