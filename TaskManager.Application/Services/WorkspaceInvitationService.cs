using System.Net.Mail;
using System.Net;
using Microsoft.Extensions.Logging;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TimeZoneConverter;

namespace TaskManager.Application.Services
{
    public class WorkspaceInvitationService : IWorkspaceInvitationService
    {
        private static readonly TimeSpan DefaultInvitationLifetime = TimeSpan.FromDays(7);
        private const string WorkspaceInviteNotificationType = "workspace_invite_received";

        private readonly IWorkspaceRepository _workspaceRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
        private readonly IUserRepository _userRepository;
        private readonly IWorkspaceInvitationRepository _workspaceInvitationRepository;
        private readonly INotificationRepository _notificationRepository;
        private readonly IEmailSender _emailSender;
        private readonly ILogger<WorkspaceInvitationService> _logger;

        public WorkspaceInvitationService(
            IWorkspaceRepository workspaceRepository,
            IWorkspaceMemberRepository workspaceMemberRepository,
            IUserRepository userRepository,
            IWorkspaceInvitationRepository workspaceInvitationRepository,
            INotificationRepository notificationRepository,
            IEmailSender emailSender,
            ILogger<WorkspaceInvitationService> logger)
        {
            _workspaceRepository = workspaceRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
            _userRepository = userRepository;
            _workspaceInvitationRepository = workspaceInvitationRepository;
            _notificationRepository = notificationRepository;
            _emailSender = emailSender;
            _logger = logger;
        }

        public async Task<WorkspaceInvitationDto> CreateInvitationAsync(
            int actorUserId,
            int workspaceId,
            CreateWorkspaceInvitationDto dto,
            CancellationToken cancellationToken = default)
        {
            if (actorUserId <= 0)
            {
                throw new ForbiddenException("Access denied");
            }

            var workspace = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            var actorMember = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId)
                ?? throw new ForbiddenException("You are not a member of this workspace");

            if (!CanManage(actorMember.Role))
            {
                throw new ForbiddenException("Only workspace admins or owners can send invitations");
            }

            var normalizedEmail = NormalizeAndValidateEmail(dto?.Email);
            var role = dto?.Role ?? WorkspaceRole.Member;

            if (!Enum.IsDefined(typeof(WorkspaceRole), role))
            {
                throw new ValidationException("Invalid invitation role");
            }

            if (role == WorkspaceRole.Owner && actorMember.Role != WorkspaceRole.Owner)
            {
                throw new ForbiddenException("Only owner can invite another owner");
            }

            var existingUser = await _userRepository.GetByEmailAsync(normalizedEmail);
            if (existingUser != null)
            {
                var isAlreadyMember = await _workspaceMemberRepository.IsMemberAsync(workspaceId, existingUser.Id);
                if (isAlreadyMember)
                {
                    throw new ValidationException("User is already a member of this workspace");
                }
            }

            var existingActive = await _workspaceInvitationRepository.GetActiveByWorkspaceAndEmailAsync(
                workspaceId,
                normalizedEmail,
                cancellationToken);
            if (existingActive != null)
            {
                throw new ConflictException("An active invitation for this email already exists");
            }

            var now = DateTime.UtcNow;
            var invitation = new WorkspaceInvitation
            {
                WorkspaceId = workspaceId,
                InvitedByUserId = actorUserId,
                InvitedUserId = existingUser?.Id,
                InvitedEmail = normalizedEmail,
                Role = role,
                Status = WorkspaceInvitationStatus.Pending,
                CreatedAtUtc = now,
                ExpiresAtUtc = now.Add(DefaultInvitationLifetime)
            };

            invitation = await _workspaceInvitationRepository.AddAsync(invitation, cancellationToken);

            var full = await _workspaceInvitationRepository.GetByIdAsync(invitation.Id, cancellationToken) ?? invitation;

            if (existingUser != null)
            {
                await CreateInviteNotificationIfMissingAsync(
                    existingUser.Id,
                    full,
                    actorMember.User?.Name,
                    now,
                    cancellationToken,
                    saveChanges: true);
            }

            try
            {
                await _emailSender.SendAsync(
                    normalizedEmail,
                    $"Приглашение в проект {workspace.Name}",
                    BuildInvitationEmailBody(
                        workspace.Name,
                        actorMember.User?.Name,
                        invitation.ExpiresAtUtc,
                        existingUser?.TimeZoneId));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(
                    ex,
                    "Failed to send workspace invitation email to {Email} for workspace {WorkspaceId} (invite {InvitationId}).",
                    normalizedEmail,
                    workspaceId,
                    invitation.Id);
            }

            return MapToDto(full, now);
        }

        public async Task<List<WorkspaceInvitationDto>> GetUserInvitationsAsync(
            int actorUserId,
            WorkspaceInvitationStatus? status = null,
            CancellationToken cancellationToken = default)
        {
            var actor = await _userRepository.GetByIdAsync(actorUserId)
                ?? throw new NotFoundException("User not found");

            var now = DateTime.UtcNow;
            await SynchronizePendingInvitationsAsync(actor, now, cancellationToken);

            var invitations = await _workspaceInvitationRepository.GetForUserAsync(
                actorUserId,
                actor.Email,
                status,
                cancellationToken);

            return invitations
                .Select(i => MapToDto(i, now))
                .OrderBy(i => i.Status == WorkspaceInvitationStatus.Pending ? 0 : 1)
                .ThenByDescending(i => i.CreatedAtUtc)
                .ToList();
        }

        public async Task SyncPendingInvitesForUserAsync(
            int actorUserId,
            CancellationToken cancellationToken = default)
        {
            var actor = await _userRepository.GetByIdAsync(actorUserId)
                ?? throw new NotFoundException("User not found");

            await SynchronizePendingInvitationsAsync(actor, DateTime.UtcNow, cancellationToken);
        }

        public async Task<WorkspaceInvitationDto> AcceptInvitationAsync(
            int actorUserId,
            int invitationId,
            CancellationToken cancellationToken = default)
        {
            var actor = await _userRepository.GetByIdAsync(actorUserId)
                ?? throw new NotFoundException("User not found");

            var invitation = await _workspaceInvitationRepository.GetByIdAsync(invitationId, cancellationToken)
                ?? throw new NotFoundException("Invitation not found");

            EnsureInvitationOwnership(invitation, actorUserId, actor.Email);

            var now = DateTime.UtcNow;
            if (invitation.Status == WorkspaceInvitationStatus.Pending && invitation.ExpiresAtUtc <= now)
            {
                invitation.Status = WorkspaceInvitationStatus.Expired;
                invitation.RespondedAtUtc = now;
                await _workspaceInvitationRepository.UpdateAsync(invitation, cancellationToken);
                throw new ValidationException("Invitation has expired");
            }

            if (invitation.Status != WorkspaceInvitationStatus.Pending)
            {
                throw new ValidationException("Invitation is no longer active");
            }

            invitation.InvitedUserId = actorUserId;
            invitation.Status = WorkspaceInvitationStatus.Accepted;
            invitation.RespondedAtUtc = now;
            await _workspaceInvitationRepository.UpdateAsync(
                invitation,
                cancellationToken,
                saveChanges: false);

            var isMember = await _workspaceMemberRepository.IsMemberAsync(invitation.WorkspaceId, actorUserId);
            if (!isMember)
            {
                await _workspaceMemberRepository.AddAsync(new WorkspaceMember
                {
                    WorkspaceId = invitation.WorkspaceId,
                    UserId = actorUserId,
                    Role = invitation.Role,
                    AddedAt = now
                }, cancellationToken, saveChanges: false);
            }

            await _workspaceInvitationRepository.SaveChangesAsync(cancellationToken);

            return MapToDto(invitation, now);
        }

        public async Task<WorkspaceInvitationDto> DeclineInvitationAsync(
            int actorUserId,
            int invitationId,
            CancellationToken cancellationToken = default)
        {
            var actor = await _userRepository.GetByIdAsync(actorUserId)
                ?? throw new NotFoundException("User not found");

            var invitation = await _workspaceInvitationRepository.GetByIdAsync(invitationId, cancellationToken)
                ?? throw new NotFoundException("Invitation not found");

            EnsureInvitationOwnership(invitation, actorUserId, actor.Email);

            var now = DateTime.UtcNow;
            if (invitation.Status == WorkspaceInvitationStatus.Pending && invitation.ExpiresAtUtc <= now)
            {
                invitation.Status = WorkspaceInvitationStatus.Expired;
                invitation.RespondedAtUtc = now;
                await _workspaceInvitationRepository.UpdateAsync(invitation, cancellationToken);
                throw new ValidationException("Invitation has expired");
            }

            if (invitation.Status != WorkspaceInvitationStatus.Pending)
            {
                throw new ValidationException("Invitation is no longer active");
            }

            invitation.InvitedUserId = actorUserId;
            invitation.Status = WorkspaceInvitationStatus.Declined;
            invitation.RespondedAtUtc = now;
            await _workspaceInvitationRepository.UpdateAsync(invitation, cancellationToken);

            return MapToDto(invitation, now);
        }

        private async Task SynchronizePendingInvitationsAsync(User actor, DateTime now, CancellationToken cancellationToken)
        {
            var pendingInvitations = await _workspaceInvitationRepository.GetForUserAsync(
                actor.Id,
                actor.Email,
                WorkspaceInvitationStatus.Pending,
                cancellationToken);

            var hasDeferredChanges = false;

            foreach (var invitation in pendingInvitations)
            {
                var shouldUpdate = false;

                if (!invitation.InvitedUserId.HasValue)
                {
                    invitation.InvitedUserId = actor.Id;
                    shouldUpdate = true;
                }

                if (invitation.ExpiresAtUtc <= now)
                {
                    invitation.Status = WorkspaceInvitationStatus.Expired;
                    invitation.RespondedAtUtc = now;
                    shouldUpdate = true;
                }

                if (shouldUpdate)
                {
                    await _workspaceInvitationRepository.UpdateAsync(
                        invitation,
                        cancellationToken,
                        saveChanges: false);
                    hasDeferredChanges = true;
                }

                if (invitation.Status == WorkspaceInvitationStatus.Pending)
                {
                    var created = await CreateInviteNotificationIfMissingAsync(
                        actor.Id,
                        invitation,
                        invitation.InvitedByUser?.Name,
                        now,
                        cancellationToken,
                        saveChanges: false);

                    hasDeferredChanges = hasDeferredChanges || created;
                }
            }

            if (hasDeferredChanges)
            {
                await _workspaceInvitationRepository.SaveChangesAsync(cancellationToken);
            }
        }

        private async Task<bool> CreateInviteNotificationIfMissingAsync(
            int invitedUserId,
            WorkspaceInvitation invitation,
            string? inviterName,
            DateTime now,
            CancellationToken cancellationToken,
            bool saveChanges)
        {
            var workspaceName = invitation.Workspace?.Name?.Trim();
            var safeWorkspaceName = string.IsNullOrWhiteSpace(workspaceName) ? "проект" : workspaceName;

            var inviter = inviterName?.Trim();
            var inviterLabel = string.IsNullOrWhiteSpace(inviter) ? "Участник проекта" : inviter;

            var actionUrl = BuildInviteActionUrl(invitation.WorkspaceId, invitation.Id);
            var exists = await _notificationRepository.ExistsByActionUrlAsync(
                invitedUserId,
                WorkspaceInviteNotificationType,
                actionUrl,
                cancellationToken);
            if (exists)
            {
                return false;
            }

            await _notificationRepository.AddAsync(new Notification
            {
                UserId = invitedUserId,
                Type = WorkspaceInviteNotificationType,
                Title = $"Приглашение в проект {safeWorkspaceName}",
                Message = $"{inviterLabel} приглашает вас присоединиться к проекту.",
                WorkspaceId = invitation.WorkspaceId,
                ActionUrl = actionUrl,
                IsRead = false,
                CreatedAt = now
            }, cancellationToken, saveChanges);

            return true;
        }

        private static WorkspaceInvitationDto MapToDto(WorkspaceInvitation invitation, DateTime now)
        {
            var workspaceName = invitation.Workspace?.Name?.Trim();
            var inviterName = invitation.InvitedByUser?.Name?.Trim();
            var inviterEmail = invitation.InvitedByUser?.Email?.Trim();
            var expired = invitation.ExpiresAtUtc <= now;
            var canRespond = invitation.Status == WorkspaceInvitationStatus.Pending && !expired;

            return new WorkspaceInvitationDto
            {
                Id = invitation.Id,
                WorkspaceId = invitation.WorkspaceId,
                WorkspaceName = string.IsNullOrWhiteSpace(workspaceName) ? "Проект" : workspaceName,
                InvitedByUserId = invitation.InvitedByUserId,
                InvitedByName = string.IsNullOrWhiteSpace(inviterName) ? "Участник" : inviterName,
                InvitedByEmail = string.IsNullOrWhiteSpace(inviterEmail) ? string.Empty : inviterEmail,
                InvitedEmail = invitation.InvitedEmail,
                Role = invitation.Role,
                Status = invitation.Status,
                CreatedAtUtc = invitation.CreatedAtUtc,
                ExpiresAtUtc = invitation.ExpiresAtUtc,
                RespondedAtUtc = invitation.RespondedAtUtc,
                CanRespond = canRespond,
                IsExpired = expired
            };
        }

        private static string NormalizeAndValidateEmail(string? rawEmail)
        {
            var email = (rawEmail ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email))
            {
                throw new ValidationException("Email is required");
            }

            if (email.Length > 100)
            {
                throw new ValidationException("Email is too long");
            }

            try
            {
                _ = new MailAddress(email);
            }
            catch
            {
                throw new ValidationException("Email is invalid");
            }

            return email;
        }

        private static bool CanManage(WorkspaceRole role)
        {
            return role == WorkspaceRole.Admin || role == WorkspaceRole.Owner;
        }

        private static void EnsureInvitationOwnership(WorkspaceInvitation invitation, int actorUserId, string actorEmail)
        {
            var emailMatches = string.Equals(
                invitation.InvitedEmail,
                actorEmail?.Trim(),
                StringComparison.OrdinalIgnoreCase);

            if (invitation.InvitedUserId == actorUserId || emailMatches)
            {
                return;
            }

            throw new ForbiddenException("You cannot manage this invitation");
        }

        private static string BuildInviteActionUrl(int workspaceId, int invitationId)
        {
            return $"invites.html?workspaceId={workspaceId}&inviteId={invitationId}";
        }

        private static string BuildInvitationEmailBody(
            string workspaceName,
            string? inviterName,
            DateTime expiresAtUtc,
            string? recipientTimeZoneId)
        {
            var safeWorkspaceName = string.IsNullOrWhiteSpace(workspaceName) ? "проект" : workspaceName;
            var inviter = string.IsNullOrWhiteSpace(inviterName) ? "Участник" : inviterName.Trim();
            var expiresLabel = FormatUtcForTimeZone(expiresAtUtc, recipientTimeZoneId);

            var workspaceHtml = WebUtility.HtmlEncode(safeWorkspaceName);
            var inviterHtml = WebUtility.HtmlEncode(inviter);
            var expiresHtml = WebUtility.HtmlEncode(expiresLabel);

            return $@"<!DOCTYPE html>
<html>
<head><meta charset=""utf-8""></head>
<body style=""font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f8fa; margin: 0; padding: 20px;"">
  <div style=""max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.12);"">
    <div style=""background: linear-gradient(135deg, #44d2c7 0%, #2c73ff 100%); color: #071017; padding: 20px 24px;"">
      <h1 style=""margin: 0; font-size: 20px; font-weight: 700;"">Приглашение в workspace</h1>
    </div>
    <div style=""padding: 24px; color: #2b3240;"">
      <p style=""margin: 0 0 12px;""><strong>{inviterHtml}</strong> приглашает вас в проект <strong>{workspaceHtml}</strong>.</p>
      <p style=""margin: 0 0 12px;"">Откройте приложение и перейдите в раздел приглашений, чтобы принять или отклонить приглашение.</p>
      <p style=""margin: 0; color: #6b7280; font-size: 13px;"">Приглашение действует до {expiresHtml}.</p>
    </div>
  </div>
</body>
</html>";
        }

        private static string FormatUtcForTimeZone(DateTime utcValue, string? timeZoneId)
        {
            var normalizedUtc = utcValue.Kind switch
            {
                DateTimeKind.Utc => utcValue,
                DateTimeKind.Local => utcValue.ToUniversalTime(),
                _ => DateTime.SpecifyKind(utcValue, DateTimeKind.Utc)
            };

            var tz = ResolveTimeZone(timeZoneId);
            var local = TimeZoneInfo.ConvertTimeFromUtc(normalizedUtc, tz);
            return local.ToString("dd.MM.yyyy HH:mm");
        }

        private static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
        {
            var raw = (timeZoneId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw))
            {
                return TimeZoneInfo.Utc;
            }

            try
            {
                return TZConvert.GetTimeZoneInfo(raw);
            }
            catch
            {
                return TimeZoneInfo.Utc;
            }
        }
    }
}
