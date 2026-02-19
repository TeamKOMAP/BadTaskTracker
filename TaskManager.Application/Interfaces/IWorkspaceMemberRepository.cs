using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface IWorkspaceMemberRepository
    {
        Task<WorkspaceMember?> GetMemberAsync(int workspaceId, int userId);
        Task<List<WorkspaceMember>> GetMembersAsync(int workspaceId);
        Task<WorkspaceMember> AddAsync(
            WorkspaceMember member,
            CancellationToken cancellationToken = default,
            bool saveChanges = true);
        Task UpdateAsync(
            WorkspaceMember member,
            CancellationToken cancellationToken = default,
            bool saveChanges = true);
        Task RemoveAsync(
            WorkspaceMember member,
            CancellationToken cancellationToken = default,
            bool saveChanges = true);
        Task<bool> IsMemberAsync(int workspaceId, int userId);
    }
}
