using TaskManager.Application.DTOs;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Interfaces
{
    public interface IWorkspaceInvitationService
    {
        Task<WorkspaceInvitationDto> CreateInvitationAsync(
            int actorUserId,
            int workspaceId,
            CreateWorkspaceInvitationDto dto,
            CancellationToken cancellationToken = default);

        Task<List<WorkspaceInvitationDto>> GetUserInvitationsAsync(
            int actorUserId,
            WorkspaceInvitationStatus? status = null,
            CancellationToken cancellationToken = default);

        Task<WorkspaceInvitationDto> AcceptInvitationAsync(
            int actorUserId,
            int invitationId,
            CancellationToken cancellationToken = default);

        Task<WorkspaceInvitationDto> DeclineInvitationAsync(
            int actorUserId,
            int invitationId,
            CancellationToken cancellationToken = default);

        Task SyncPendingInvitesForUserAsync(
            int actorUserId,
            CancellationToken cancellationToken = default);
    }
}
