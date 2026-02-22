using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using Microsoft.Extensions.Logging;
using System.Net;

namespace TaskManager.Application.Services
{
    public class WorkspaceService : IWorkspaceService
    {
        private readonly IWorkspaceRepository _workspaceRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
        private readonly IUserRepository _userRepository;
        private readonly ITaskRepository _taskRepository;
        private readonly INotificationRepository _notificationRepository;
        private readonly IEmailSender _emailSender;
        private readonly ILogger<WorkspaceService> _logger;

        public WorkspaceService(
            IWorkspaceRepository workspaceRepository,
            IWorkspaceMemberRepository workspaceMemberRepository,
            IUserRepository userRepository,
            ITaskRepository taskRepository,
            INotificationRepository notificationRepository,
            IEmailSender emailSender,
            ILogger<WorkspaceService> logger)
        {
            _workspaceRepository = workspaceRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
            _userRepository = userRepository;
            _taskRepository = taskRepository;
            _notificationRepository = notificationRepository;
            _emailSender = emailSender;
            _logger = logger;
        }

        public async Task<IEnumerable<WorkspaceDto>> GetWorkspacesAsync(int actorUserId)
        {
            var workspaces = await _workspaceRepository.GetByUserAsync(actorUserId);
            return workspaces.Select(ws => MapWorkspace(ws, actorUserId));
        }

        public async Task<WorkspaceDto> GetWorkspaceAsync(int actorUserId, int workspaceId)
        {
            var workspace = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            await EnsureMemberAsync(workspaceId, actorUserId);
            return MapWorkspace(workspace, actorUserId);
        }

        public async Task<WorkspaceDto> CreateWorkspaceAsync(int actorUserId, CreateWorkspaceDto dto)
        {
            var user = await _userRepository.GetByIdAsync(actorUserId)
                ?? throw new NotFoundException($"User with id {actorUserId} not found");

            var name = dto.Name.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ValidationException("Workspace name is required");
            }

            var workspace = new Workspace
            {
                Name = name,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = user.Id
            };

            var created = await _workspaceRepository.AddAsync(workspace);
            await _workspaceMemberRepository.AddAsync(new WorkspaceMember
            {
                WorkspaceId = created.Id,
                UserId = user.Id,
                Role = WorkspaceRole.Owner,
                AddedAt = DateTime.UtcNow
            });

            var full = await _workspaceRepository.GetByIdAsync(created.Id)
                ?? throw new NotFoundException($"Workspace with id {created.Id} not found");

            return MapWorkspace(full, actorUserId);
        }

        public async Task<WorkspaceDto> SetAvatarAsync(int actorUserId, int workspaceId, string avatarPath)
        {
            var workspace = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId)
                ?? throw new ForbiddenException("You are not a member of this workspace");

            if (!CanEditWorkspace(member.Role))
            {
                throw new ForbiddenException("Only workspace owner can update avatar");
            }

            workspace.AvatarPath = avatarPath;
            await _workspaceRepository.UpdateAsync(workspace);

            var updated = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            return MapWorkspace(updated, actorUserId);
        }

        public async Task<WorkspaceDto> ClearAvatarAsync(int actorUserId, int workspaceId)
        {
            var workspace = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId)
                ?? throw new ForbiddenException("You are not a member of this workspace");

            if (!CanEditWorkspace(member.Role))
            {
                throw new ForbiddenException("Only workspace owner can update avatar");
            }

            workspace.AvatarPath = null;
            await _workspaceRepository.UpdateAsync(workspace);

            var updated = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            return MapWorkspace(updated, actorUserId);
        }

        public async Task<WorkspaceDto> UpdateWorkspaceAsync(int actorUserId, int workspaceId, UpdateWorkspaceDto dto)
        {
            var workspace = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId)
                ?? throw new ForbiddenException("You are not a member of this workspace");

            if (!CanManage(member.Role))
            {
                throw new ForbiddenException("Only workspace admin or owner can update workspace");
            }

            var name = dto.Name.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ValidationException("Workspace name is required");
            }

            workspace.Name = name;
            await _workspaceRepository.UpdateAsync(workspace);

            var updated = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            return MapWorkspace(updated, actorUserId);
        }

        public async Task<IEnumerable<WorkspaceMemberDto>> GetMembersAsync(int actorUserId, int workspaceId)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            var members = await _workspaceMemberRepository.GetMembersAsync(workspaceId);
            var tasks = await _taskRepository.GetAllAsync(workspaceId);
            var counts = tasks
                .Where(t => t.AssigneeId.HasValue)
                .GroupBy(t => t.AssigneeId!.Value)
                .ToDictionary(g => g.Key, g => g.Count());

            return members
                .OrderByDescending(m => m.Role)
                .ThenBy(m => m.User.Name)
                .Select(m => new WorkspaceMemberDto
                {
                    UserId = m.UserId,
                    Name = m.User.Name,
                    Email = m.User.Email,
                    Role = m.Role,
                    AddedAt = m.AddedAt,
                    TaskCount = counts.TryGetValue(m.UserId, out var taskCount) ? taskCount : 0
                });
        }

        public async Task<WorkspaceMemberDto> AddMemberAsync(int actorUserId, int workspaceId, AddWorkspaceMemberDto dto)
        {
            if (dto == null)
            {
                throw new ValidationException("Request payload is required");
            }

            var actorMember = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId)
                ?? throw new ForbiddenException("You are not a member of this workspace");

            if (actorMember.Role != WorkspaceRole.Owner)
            {
                throw new ForbiddenException("Only workspace owner can manage roles");
            }

            if (!dto.UserId.HasValue || dto.UserId.Value <= 0)
            {
                throw new ValidationException("Direct member addition is disabled. Use workspace invitations.");
            }

            if (!string.IsNullOrWhiteSpace(dto.Email) || !string.IsNullOrWhiteSpace(dto.Name))
            {
                throw new ValidationException("Email/name based member addition is disabled. Use workspace invitations.");
            }

            var user = await _userRepository.GetByIdAsync(dto.UserId.Value)
                ?? throw new NotFoundException($"User with id {dto.UserId.Value} not found");

            var existing = await _workspaceMemberRepository.GetMemberAsync(workspaceId, user.Id);
            if (existing == null)
            {
                throw new ValidationException("Member does not belong to workspace. Invite user first.");
            }

            if (existing.Role == WorkspaceRole.Owner)
            {
                throw new ValidationException("Workspace owner role cannot be changed");
            }

            if (dto.Role == WorkspaceRole.Owner)
            {
                throw new ValidationException("Owner role cannot be assigned via this endpoint");
            }

            existing.Role = dto.Role;
            await _workspaceMemberRepository.UpdateAsync(existing);

            return new WorkspaceMemberDto
            {
                UserId = user.Id,
                Name = user.Name,
                Email = user.Email,
                Role = existing.Role,
                AddedAt = existing.AddedAt
            };
        }

        public async Task RemoveMemberAsync(int actorUserId, int workspaceId, int memberUserId)
        {
            var actorMember = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId)
                ?? throw new ForbiddenException("You are not a member of this workspace");

            if (!CanManage(actorMember.Role))
            {
                throw new ForbiddenException("Only workspace admin or owner can remove members");
            }

            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, memberUserId)
                ?? throw new NotFoundException($"Member with user id {memberUserId} not found");

            if (member.Role == WorkspaceRole.Owner)
            {
                throw new ValidationException("Workspace owner cannot be removed");
            }

            if (actorMember.Role == WorkspaceRole.Admin && member.Role != WorkspaceRole.Member)
            {
                throw new ForbiddenException("Workspace admin can only remove members");
            }

            var now = DateTime.UtcNow;
            var workspaceName = member.Workspace?.Name
                ?? (await _workspaceRepository.GetByIdAsync(workspaceId))?.Name
                ?? "Проект";

            var actorLabel = actorMember.User?.Name
                ?? actorMember.User?.Email
                ?? $"User #{actorUserId}";

            var removedEmail = member.User?.Email;
            var removedName = member.User?.Name;

            await _workspaceMemberRepository.RemoveAsync(member);

            // In-app notification for the removed user.
            try
            {
                var safeWorkspaceName = workspaceName.Length > 120 ? workspaceName[..120] + "..." : workspaceName;
                var safeActorLabel = actorLabel.Length > 120 ? actorLabel[..120] + "..." : actorLabel;
                await _notificationRepository.AddAsync(new Notification
                {
                    UserId = memberUserId,
                    Type = "workspace_member_removed",
                    Title = "Вы удалены из проекта",
                    Message = $"{safeActorLabel} удалил вас из проекта \"{safeWorkspaceName}\".",
                    WorkspaceId = workspaceId,
                    ActionUrl = "index.html",
                    IsRead = false,
                    CreatedAt = now
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to create workspace removal notification. WorkspaceId={WorkspaceId}, UserId={UserId}", workspaceId, memberUserId);
            }

            // Email notification (best-effort).
            if (!string.IsNullOrWhiteSpace(removedEmail))
            {
                try
                {
                    var subject = $"Вы удалены из проекта: {workspaceName}";
                    await _emailSender.SendAsync(
                        removedEmail,
                        subject,
                        BuildRemovedFromWorkspaceEmailBody(workspaceName, actorLabel, removedName));
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to send workspace removal email. WorkspaceId={WorkspaceId}, To={Email}", workspaceId, removedEmail);
                }
            }
        }

        public async Task DeleteWorkspaceAsync(int actorUserId, int workspaceId)
        {
            var workspace = await _workspaceRepository.GetByIdAsync(workspaceId)
                ?? throw new NotFoundException($"Workspace with id {workspaceId} not found");

            var actorMember = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId)
                ?? throw new ForbiddenException("You are not a member of this workspace");

            if (actorMember.Role != WorkspaceRole.Owner)
            {
                throw new ForbiddenException("Only workspace owner can delete the workspace");
            }

            await _workspaceRepository.DeleteAsync(workspace);
        }

        private static string BuildRemovedFromWorkspaceEmailBody(string workspaceName, string removedBy, string? recipientName)
        {
            var safeWorkspace = string.IsNullOrWhiteSpace(workspaceName) ? "проект" : workspaceName.Trim();
            var safeActor = string.IsNullOrWhiteSpace(removedBy) ? "Администратор" : removedBy.Trim();
            var safeRecipient = string.IsNullOrWhiteSpace(recipientName) ? "" : recipientName.Trim();

            var workspaceHtml = WebUtility.HtmlEncode(safeWorkspace);
            var actorHtml = WebUtility.HtmlEncode(safeActor);
            var recipientHtml = WebUtility.HtmlEncode(safeRecipient);
            var greeting = string.IsNullOrWhiteSpace(safeRecipient) ? "" : $"<p style=\"margin: 0 0 12px;\">Привет, <strong>{recipientHtml}</strong>.</p>";

            return $"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f6f8fa; margin: 0; padding: 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.12);">
    <div style="background: linear-gradient(135deg, #ef4444 0%, #f59e0b 100%); color: #071017; padding: 20px 24px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">Доступ к проекту удален</h1>
    </div>
    <div style="padding: 24px; color: #2b3240;">
      {greeting}
      <p style="margin: 0 0 12px;">Пользователь <strong>{actorHtml}</strong> удалил вас из проекта <strong>{workspaceHtml}</strong>.</p>
      <p style="margin: 0; color: #6b7280; font-size: 13px;">Если вы считаете, что это ошибка, свяжитесь с владельцем проекта.</p>
    </div>
  </div>
</body>
</html>
""";
        }

        private async Task EnsureMemberAsync(int workspaceId, int actorUserId)
        {
            var isMember = await _workspaceMemberRepository.IsMemberAsync(workspaceId, actorUserId);
            if (!isMember)
            {
                throw new ForbiddenException("You are not a member of this workspace");
            }
        }

        private static bool CanEditWorkspace(WorkspaceRole role)
        {
            return role == WorkspaceRole.Owner;
        }

        private static bool CanManage(WorkspaceRole role)
        {
            return role == WorkspaceRole.Owner || role == WorkspaceRole.Admin;
        }

        private static WorkspaceDto MapWorkspace(Workspace workspace, int actorUserId)
        {
            var role = workspace.Members.FirstOrDefault(m => m.UserId == actorUserId)?.Role ?? WorkspaceRole.Member;
            return new WorkspaceDto
            {
                Id = workspace.Id,
                Name = workspace.Name,
                AvatarPath = workspace.AvatarPath,
                CreatedByUserId = workspace.CreatedByUserId,
                CreatedByUserName = workspace.CreatedByUser?.Name ?? string.Empty,
                CreatedAt = workspace.CreatedAt,
                CurrentUserRole = role,
                MemberCount = workspace.Members.Count
            };
        }
    }
}
