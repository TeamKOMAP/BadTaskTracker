using System.IO;
using System.Text.Json;
using System.Threading;
using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using TaskManager.Application.Attachments;
using TaskManager.Application.Interfaces;

namespace TaskManager.Infrastructure.Storage
{
    public class FileAttachmentStorage : IAttachmentStorage
    {
        private static readonly ConcurrentDictionary<int, SemaphoreSlim> TaskLocks = new();

        private readonly string _contentRootPath;
        private readonly ILogger<FileAttachmentStorage> _logger;

        public FileAttachmentStorage(string contentRootPath, ILogger<FileAttachmentStorage> logger)
        {
            _contentRootPath = contentRootPath;
            _logger = logger;
        }

        private sealed class AttachmentRecord
        {
            public string Id { get; set; } = string.Empty;
            public int TaskId { get; set; }
            public string FileName { get; set; } = string.Empty;
            public string StoredName { get; set; } = string.Empty;
            public string ContentType { get; set; } = "application/octet-stream";
            public long Size { get; set; }
            public DateTime UploadedAtUtc { get; set; }
        }

        private sealed class AttachmentIndex
        {
            public Dictionary<string, AttachmentRecord> Items { get; set; } = new();
        }

        private string GetTaskFolder(int taskId)
            => Path.Combine(_contentRootPath, "App_Data", "attachments", $"task-{taskId}");

        private string GetIndexPath(int taskId)
            => Path.Combine(GetTaskFolder(taskId), "index.json");

        public async Task<IReadOnlyList<AttachmentMeta>> ListAsync(int taskId, CancellationToken cancellationToken = default)
        {
            var index = await LoadIndexAsync(taskId, cancellationToken);
            return index.Items.Values
                .OrderByDescending(x => x.UploadedAtUtc)
                .Select(ToMeta)
                .ToList();
        }

        public async Task<int> CountAsync(int taskId, CancellationToken cancellationToken = default)
        {
            var index = await LoadIndexAsync(taskId, cancellationToken);
            return index.Items.Count;
        }

        public async Task<IReadOnlyDictionary<int, int>> CountByTaskIdsAsync(
            IReadOnlyCollection<int> taskIds,
            CancellationToken cancellationToken = default)
        {
            if (taskIds == null || taskIds.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            var normalizedIds = taskIds
                .Where(id => id > 0)
                .Distinct()
                .ToList();

            if (normalizedIds.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            const int maxConcurrency = 8;
            using var gate = new SemaphoreSlim(maxConcurrency, maxConcurrency);

            var countTasks = normalizedIds.Select(async taskId =>
            {
                await gate.WaitAsync(cancellationToken);
                try
                {
                    var count = await CountAsync(taskId, cancellationToken);
                    return new KeyValuePair<int, int>(taskId, count);
                }
                finally
                {
                    gate.Release();
                }
            });

            var result = await Task.WhenAll(countTasks);
            return result.ToDictionary(x => x.Key, x => x.Value);
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

            var gate = GetTaskGate(taskId);
            await gate.WaitAsync(cancellationToken);
            try
            {
                var folder = GetTaskFolder(taskId);
                Directory.CreateDirectory(folder);
                var index = await LoadIndexAsync(taskId, cancellationToken);
                var created = new List<AttachmentMeta>();

                foreach (var upload in uploads)
                {
                    if (upload == null || upload.Size <= 0 || upload.Content == null)
                    {
                        continue;
                    }

                    var originalName = Path.GetFileName(upload.FileName ?? "file");
                    if (string.IsNullOrWhiteSpace(originalName))
                    {
                        originalName = "file";
                    }

                    var id = Guid.NewGuid().ToString("N");
                    var ext = Path.GetExtension(originalName);
                    var storedName = string.IsNullOrWhiteSpace(ext) ? id : (id + ext);
                    var path = Path.Combine(folder, storedName);

                    try
                    {
                        await using (var stream = File.Create(path))
                        {
                            await upload.Content.CopyToAsync(stream, cancellationToken);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to store attachment for task {TaskId}", taskId);
                        continue;
                    }

                    var record = new AttachmentRecord
                    {
                        Id = id,
                        TaskId = taskId,
                        FileName = originalName,
                        StoredName = storedName,
                        ContentType = string.IsNullOrWhiteSpace(upload.ContentType) ? "application/octet-stream" : upload.ContentType,
                        Size = upload.Size,
                        UploadedAtUtc = DateTime.UtcNow
                    };

                    index.Items[id] = record;
                    created.Add(ToMeta(record));
                }

                await SaveIndexAsync(taskId, index, cancellationToken);
                return created;
            }
            finally
            {
                gate.Release();
            }
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

            var index = await LoadIndexAsync(taskId, cancellationToken);
            if (!index.Items.TryGetValue(attachmentId, out var record))
            {
                return null;
            }

            var path = Path.Combine(GetTaskFolder(taskId), record.StoredName);
            if (!File.Exists(path))
            {
                return null;
            }

            var stream = File.OpenRead(path);
            return new AttachmentContent(ToMeta(record), stream);
        }

        public async Task<bool> DeleteAsync(int taskId, string attachmentId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(attachmentId))
            {
                return false;
            }

            var gate = GetTaskGate(taskId);
            await gate.WaitAsync(cancellationToken);
            try
            {
                var index = await LoadIndexAsync(taskId, cancellationToken);
                if (!index.Items.TryGetValue(attachmentId, out var record))
                {
                    return false;
                }

                var path = Path.Combine(GetTaskFolder(taskId), record.StoredName);
                try
                {
                    if (File.Exists(path))
                    {
                        File.Delete(path);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to delete attachment {AttachmentId} for task {TaskId}", attachmentId, taskId);
                    return false;
                }

                index.Items.Remove(attachmentId);
                await SaveIndexAsync(taskId, index, cancellationToken);
                return true;
            }
            finally
            {
                gate.Release();
            }
        }

        private async Task<AttachmentIndex> LoadIndexAsync(int taskId, CancellationToken cancellationToken)
        {
            var folder = GetTaskFolder(taskId);
            Directory.CreateDirectory(folder);
            var path = GetIndexPath(taskId);

            if (!File.Exists(path))
            {
                return new AttachmentIndex();
            }

            try
            {
                var json = await File.ReadAllTextAsync(path, cancellationToken);
                var index = JsonSerializer.Deserialize<AttachmentIndex>(json);
                return index ?? new AttachmentIndex();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read attachment index for task {TaskId}", taskId);
                return new AttachmentIndex();
            }
        }

        private async Task SaveIndexAsync(int taskId, AttachmentIndex index, CancellationToken cancellationToken)
        {
            var folder = GetTaskFolder(taskId);
            Directory.CreateDirectory(folder);
            var path = GetIndexPath(taskId);
            var tempPath = Path.Combine(folder, $"index.{Guid.NewGuid():N}.tmp");
            var json = JsonSerializer.Serialize(index, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            try
            {
                await File.WriteAllTextAsync(tempPath, json, cancellationToken);
                File.Move(tempPath, path, true);
            }
            finally
            {
                if (File.Exists(tempPath))
                {
                    try
                    {
                        File.Delete(tempPath);
                    }
                    catch
                    {
                        // best effort cleanup
                    }
                }
            }
        }

        private static SemaphoreSlim GetTaskGate(int taskId)
            => TaskLocks.GetOrAdd(taskId, _ => new SemaphoreSlim(1, 1));

        private static AttachmentMeta ToMeta(AttachmentRecord record)
        {
            return new AttachmentMeta
            {
                Id = record.Id,
                TaskId = record.TaskId,
                FileName = record.FileName,
                ContentType = record.ContentType,
                Size = record.Size,
                UploadedAtUtc = record.UploadedAtUtc
            };
        }
    }
}
