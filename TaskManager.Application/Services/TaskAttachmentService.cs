using System.Threading;
using TaskManager.Application.Attachments;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Services
{
    public class TaskAttachmentService : ITaskAttachmentService
    {
        private readonly IAttachmentStorage _storage;
        private readonly ITaskRepository _taskRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;

        public TaskAttachmentService(
            IAttachmentStorage storage,
            ITaskRepository taskRepository,
            IWorkspaceMemberRepository workspaceMemberRepository)
        {
            _storage = storage;
            _taskRepository = taskRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
        }

        public async Task<IReadOnlyList<AttachmentMeta>> ListAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            CancellationToken cancellationToken = default)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            await EnsureTaskExistsAsync(workspaceId, taskId);
            return await _storage.ListAsync(taskId, cancellationToken);
        }

        public async Task<int> CountAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            CancellationToken cancellationToken = default)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            await EnsureTaskExistsAsync(workspaceId, taskId);
            return await _storage.CountAsync(taskId, cancellationToken);
        }

        public async Task<IReadOnlyList<AttachmentMeta>> UploadAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            IReadOnlyList<AttachmentUpload> uploads,
            CancellationToken cancellationToken = default)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            await EnsureTaskExistsAsync(workspaceId, taskId);

            if (uploads == null || uploads.Count == 0)
            {
                return Array.Empty<AttachmentMeta>();
            }

            return await _storage.SaveAsync(taskId, uploads, cancellationToken);
        }

        public async Task<AttachmentContent> DownloadAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            string attachmentId,
            CancellationToken cancellationToken = default)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            await EnsureTaskExistsAsync(workspaceId, taskId);

            var content = await _storage.OpenReadAsync(taskId, attachmentId, cancellationToken);
            if (content == null)
            {
                throw new NotFoundException("Attachment not found");
            }

            return content;
        }

        public async Task DeleteAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            string attachmentId,
            CancellationToken cancellationToken = default)
        {
            var member = await EnsureMemberAsync(workspaceId, actorUserId);
            if (!CanManage(member.Role))
            {
                throw new ForbiddenException("Only workspace admin can delete attachments");
            }

            await EnsureTaskExistsAsync(workspaceId, taskId);

            var deleted = await _storage.DeleteAsync(taskId, attachmentId, cancellationToken);
            if (!deleted)
            {
                throw new NotFoundException("Attachment not found");
            }
        }

        private async Task<WorkspaceMember> EnsureMemberAsync(int workspaceId, int actorUserId)
        {
            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId);
            if (member == null)
            {
                throw new ForbiddenException("Access denied");
            }

            return member;
        }

        private async Task EnsureTaskExistsAsync(int workspaceId, int taskId)
        {
            var exists = await _taskRepository.ExistsAsync(taskId, workspaceId);
            if (!exists)
            {
                throw new NotFoundException("Task not found");
            }
        }

        private static bool CanManage(WorkspaceRole role)
        {
            return role == WorkspaceRole.Owner || role == WorkspaceRole.Admin;
        }
    }
}
