using System.Threading;
using TaskManager.Application.Attachments;

namespace TaskManager.Application.Interfaces
{
    public interface ITaskAttachmentService
    {
        Task<IReadOnlyList<AttachmentMeta>> ListAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            CancellationToken cancellationToken = default);
        Task<int> CountAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            CancellationToken cancellationToken = default);
        Task<IReadOnlyDictionary<int, int>> CountByTaskIdsAsync(
            int workspaceId,
            int actorUserId,
            IReadOnlyList<int> taskIds,
            CancellationToken cancellationToken = default);
        Task<IReadOnlyList<AttachmentMeta>> UploadAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            IReadOnlyList<AttachmentUpload> uploads,
            CancellationToken cancellationToken = default);
        Task<AttachmentContent> DownloadAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            string attachmentId,
            CancellationToken cancellationToken = default);
        Task DeleteAsync(
            int workspaceId,
            int actorUserId,
            int taskId,
            string attachmentId,
            CancellationToken cancellationToken = default);
    }
}
