using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Services
{
    public class WorkspaceService : IWorkspaceService
    {
        private readonly IWorkspaceRepository _workspaceRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
        private readonly IUserRepository _userRepository;
        private readonly ITaskRepository _taskRepository;

        public WorkspaceService(
            IWorkspaceRepository workspaceRepository,
            IWorkspaceMemberRepository workspaceMemberRepository,
            IUserRepository userRepository,
            ITaskRepository taskRepository)
        {
            _workspaceRepository = workspaceRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
            _userRepository = userRepository;
            _taskRepository = taskRepository;
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

            if (!CanManage(actorMember.Role))
            {
                throw new ForbiddenException("Only workspace admin can add members");
            }

            if (dto.Role == WorkspaceRole.Owner && actorMember.Role != WorkspaceRole.Owner)
            {
                throw new ForbiddenException("Only owner can assign owner role");
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
                throw new ForbiddenException("Only workspace admin can remove members");
            }

            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, memberUserId)
                ?? throw new NotFoundException($"Member with user id {memberUserId} not found");

            if (member.Role == WorkspaceRole.Owner)
            {
                throw new ValidationException("Workspace owner cannot be removed");
            }

            await _workspaceMemberRepository.RemoveAsync(member);
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
