using System.Threading;
using TaskManager.Application.Attachments;

namespace TaskManager.Application.Interfaces
{
    public interface IAttachmentStorage
    {
        Task<IReadOnlyList<AttachmentMeta>> ListAsync(int taskId, CancellationToken cancellationToken = default);
        Task<int> CountAsync(int taskId, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<AttachmentMeta>> SaveAsync(
            int taskId,
            IReadOnlyList<AttachmentUpload> uploads,
            CancellationToken cancellationToken = default);
        Task<AttachmentContent?> OpenReadAsync(
            int taskId,
            string attachmentId,
            CancellationToken cancellationToken = default);
        Task<bool> DeleteAsync(int taskId, string attachmentId, CancellationToken cancellationToken = default);
    }
}
