using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Attachments;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Storage
{
    public class ObjectAttachmentStorage : IAttachmentStorage
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IObjectStorage _objectStorage;
        private readonly StorageSettings _storageSettings;

        public ObjectAttachmentStorage(
            ApplicationDbContext dbContext,
            IObjectStorage objectStorage,
            StorageSettings storageSettings)
        {
            _dbContext = dbContext;
            _objectStorage = objectStorage;
            _storageSettings = storageSettings;
        }

        public async Task<IReadOnlyList<AttachmentMeta>> ListAsync(int taskId, CancellationToken cancellationToken = default)
        {
            return await _dbContext.TaskAttachments
                .AsNoTracking()
                .Where(a => a.TaskId == taskId)
                .OrderByDescending(a => a.UploadedAtUtc)
                .Select(ToMetaExpression())
                .ToListAsync(cancellationToken);
        }

        public Task<int> CountAsync(int taskId, CancellationToken cancellationToken = default)
        {
            return _dbContext.TaskAttachments
                .AsNoTracking()
                .CountAsync(a => a.TaskId == taskId, cancellationToken);
        }

        public async Task<IReadOnlyDictionary<int, int>> CountByTaskIdsAsync(
            IReadOnlyCollection<int> taskIds,
            CancellationToken cancellationToken = default)
        {
            if (taskIds == null || taskIds.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            var normalizedTaskIds = taskIds
                .Where(id => id > 0)
                .Distinct()
                .ToList();

            if (normalizedTaskIds.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            var rows = await _dbContext.TaskAttachments
                .AsNoTracking()
                .Where(a => normalizedTaskIds.Contains(a.TaskId))
                .GroupBy(a => a.TaskId)
                .Select(g => new
                {
                    TaskId = g.Key,
                    Count = g.Count()
                })
                .ToListAsync(cancellationToken);

            return rows.ToDictionary(x => x.TaskId, x => x.Count);
        }

        public async Task<IReadOnlyList<AttachmentMeta>> SaveAsync(
            int taskId,
            IReadOnlyList<AttachmentUpload> uploads,
            CancellationToken cancellationToken = default)
        {
            if (uploads == null || uploads.Count == 0)
            {
                return Array.Empty<AttachmentMeta>();
            }

            var created = new List<TaskAttachment>();

            foreach (var upload in uploads)
            {
                if (upload == null || upload.Size <= 0 || upload.Content == null)
                {
                    continue;
                }

                var id = Guid.NewGuid().ToString("N");
                var fileName = NormalizeFileName(upload.FileName);
                var ext = Path.GetExtension(fileName);
                var objectKey = $"attachments/task-{taskId}/{id}{ext}";

                await _objectStorage.UploadAsync(
                    _storageSettings.PrivateBucket,
                    objectKey,
                    upload.Content,
                    string.IsNullOrWhiteSpace(upload.ContentType)
                        ? "application/octet-stream"
                        : upload.ContentType,
                    cancellationToken);

                created.Add(new TaskAttachment
                {
                    Id = id,
                    TaskId = taskId,
                    FileName = fileName,
                    ObjectKey = objectKey,
                    ContentType = string.IsNullOrWhiteSpace(upload.ContentType)
                        ? "application/octet-stream"
                        : upload.ContentType,
                    Size = upload.Size,
                    UploadedAtUtc = DateTime.UtcNow
                });
            }

            if (created.Count == 0)
            {
                return Array.Empty<AttachmentMeta>();
            }

            await _dbContext.TaskAttachments.AddRangeAsync(created, cancellationToken);
            await _dbContext.SaveChangesAsync(cancellationToken);

            return created
                .OrderByDescending(a => a.UploadedAtUtc)
                .Select(ToMeta)
                .ToList();
        }

        public async Task<AttachmentContent?> OpenReadAsync(
            int taskId,
            string attachmentId,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(attachmentId))
            {
                return null;
            }

            var attachment = await _dbContext.TaskAttachments
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    a => a.TaskId == taskId && a.Id == attachmentId,
                    cancellationToken);

            if (attachment == null)
            {
                return null;
            }

            var stream = await _objectStorage.OpenReadAsync(
                _storageSettings.PrivateBucket,
                attachment.ObjectKey,
                cancellationToken);

            if (stream == null)
            {
                return null;
            }

            return new AttachmentContent(ToMeta(attachment), stream);
        }

        public async Task<bool> DeleteAsync(int taskId, string attachmentId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(attachmentId))
            {
                return false;
            }

            var attachment = await _dbContext.TaskAttachments
                .FirstOrDefaultAsync(
                    a => a.TaskId == taskId && a.Id == attachmentId,
                    cancellationToken);

            if (attachment == null)
            {
                return false;
            }

            if (!string.IsNullOrWhiteSpace(attachment.ObjectKey))
            {
                await _objectStorage.DeleteAsync(
                    _storageSettings.PrivateBucket,
                    attachment.ObjectKey,
                    cancellationToken);
            }

            _dbContext.TaskAttachments.Remove(attachment);
            await _dbContext.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task DeleteAllForTaskAsync(int taskId, CancellationToken cancellationToken = default)
        {
            if (taskId <= 0)
            {
                return;
            }

            var attachments = await _dbContext.TaskAttachments
                .Where(a => a.TaskId == taskId)
                .ToListAsync(cancellationToken);

            if (attachments.Count == 0)
            {
                return;
            }

            foreach (var attachment in attachments)
            {
                if (!string.IsNullOrWhiteSpace(attachment.ObjectKey))
                {
                    await _objectStorage.DeleteAsync(
                        _storageSettings.PrivateBucket,
                        attachment.ObjectKey,
                        cancellationToken);
                }
            }

            _dbContext.TaskAttachments.RemoveRange(attachments);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        private static string NormalizeFileName(string? fileName)
        {
            var normalized = Path.GetFileName(fileName ?? "file");
            return string.IsNullOrWhiteSpace(normalized) ? "file" : normalized;
        }

        private static System.Linq.Expressions.Expression<Func<TaskAttachment, AttachmentMeta>> ToMetaExpression()
        {
            return item => new AttachmentMeta
            {
                Id = item.Id,
                TaskId = item.TaskId,
                FileName = item.FileName,
                ContentType = item.ContentType,
                Size = item.Size,
                UploadedAtUtc = item.UploadedAtUtc
            };
        }

        private static AttachmentMeta ToMeta(TaskAttachment item)
        {
            return new AttachmentMeta
            {
                Id = item.Id,
                TaskId = item.TaskId,
                FileName = item.FileName,
                ContentType = item.ContentType,
                Size = item.Size,
                UploadedAtUtc = item.UploadedAtUtc
            };
        }
    }
}
