using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface IWorkspaceMemberRepository
    {
        Task<WorkspaceMember?> GetMemberAsync(int workspaceId, int userId);
        Task<List<WorkspaceMember>> GetMembersAsync(int workspaceId);
        Task<WorkspaceMember> AddAsync(WorkspaceMember member);
        Task UpdateAsync(WorkspaceMember member);
        Task RemoveAsync(WorkspaceMember member);
        Task<bool> IsMemberAsync(int workspaceId, int userId);
    }
}
