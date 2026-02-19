using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class WorkspaceInvitationRepository : IWorkspaceInvitationRepository
    {
        private readonly ApplicationDbContext _context;

        public WorkspaceInvitationRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<WorkspaceInvitation> AddAsync(
            WorkspaceInvitation invitation,
            CancellationToken cancellationToken = default,
            bool saveChanges = true)
        {
            await _context.WorkspaceInvitations.AddAsync(invitation, cancellationToken);
            if (saveChanges)
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
            return invitation;
        }

        public Task<WorkspaceInvitation?> GetByIdAsync(int invitationId, CancellationToken cancellationToken = default)
        {
            return _context.WorkspaceInvitations
                .Include(i => i.Workspace)
                .Include(i => i.InvitedByUser)
                .Include(i => i.InvitedUser)
                .FirstOrDefaultAsync(i => i.Id == invitationId, cancellationToken);
        }

        public Task<WorkspaceInvitation?> GetActiveByWorkspaceAndEmailAsync(
            int workspaceId,
            string invitedEmail,
            CancellationToken cancellationToken = default)
        {
            var normalizedEmail = invitedEmail.Trim().ToLowerInvariant();
            var now = DateTime.UtcNow;

            return _context.WorkspaceInvitations
                .AsNoTracking()
                .FirstOrDefaultAsync(i =>
                    i.WorkspaceId == workspaceId
                    && i.InvitedEmail == normalizedEmail
                    && i.Status == WorkspaceInvitationStatus.Pending
                    && i.ExpiresAtUtc > now,
                    cancellationToken);
        }

        public async Task<List<WorkspaceInvitation>> GetForUserAsync(
            int userId,
            string email,
            WorkspaceInvitationStatus? status = null,
            CancellationToken cancellationToken = default)
        {
            var normalizedEmail = email.Trim().ToLowerInvariant();

            var query = _context.WorkspaceInvitations
                .Include(i => i.Workspace)
                .Include(i => i.InvitedByUser)
                .Include(i => i.InvitedUser)
                .Where(i => i.InvitedUserId == userId || i.InvitedEmail == normalizedEmail);

            if (status.HasValue)
            {
                query = query.Where(i => i.Status == status.Value);
            }

            return await query
                .OrderBy(i => i.Status == WorkspaceInvitationStatus.Pending ? 0 : 1)
                .ThenByDescending(i => i.CreatedAtUtc)
                .ToListAsync(cancellationToken);
        }

        public async Task UpdateAsync(
            WorkspaceInvitation invitation,
            CancellationToken cancellationToken = default,
            bool saveChanges = true)
        {
            _context.WorkspaceInvitations.Update(invitation);
            if (saveChanges)
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
        }

        public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
