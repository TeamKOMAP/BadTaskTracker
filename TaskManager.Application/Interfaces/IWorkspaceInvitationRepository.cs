using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Interfaces
{
    public interface IWorkspaceInvitationRepository
    {
        Task<WorkspaceInvitation> AddAsync(WorkspaceInvitation invitation, CancellationToken cancellationToken = default);
        Task<WorkspaceInvitation?> GetByIdAsync(int invitationId, CancellationToken cancellationToken = default);
        Task<WorkspaceInvitation?> GetActiveByWorkspaceAndEmailAsync(
            int workspaceId,
            string invitedEmail,
            CancellationToken cancellationToken = default);
        Task<List<WorkspaceInvitation>> GetForUserAsync(
            int userId,
            string email,
            WorkspaceInvitationStatus? status = null,
            CancellationToken cancellationToken = default);
        Task UpdateAsync(WorkspaceInvitation invitation, CancellationToken cancellationToken = default);
    }
}
