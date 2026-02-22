using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.API.Configuration
{
    public class LegacyStorageMigrator
    {
        private readonly ApplicationDbContext _dbContext;
        private readonly IWebHostEnvironment _environment;
        private readonly IObjectStorage _objectStorage;
        private readonly StorageSettings _storageSettings;
        private readonly ILogger<LegacyStorageMigrator> _logger;

        public LegacyStorageMigrator(
            ApplicationDbContext dbContext,
            IWebHostEnvironment environment,
            IObjectStorage objectStorage,
            StorageSettings storageSettings,
            ILogger<LegacyStorageMigrator> logger)
        {
            _dbContext = dbContext;
            _environment = environment;
            _objectStorage = objectStorage;
            _storageSettings = storageSettings;
            _logger = logger;
        }

        public async Task MigrateAsync(CancellationToken cancellationToken = default)
        {
            await MigrateWorkspaceAvatarsAsync(cancellationToken);
            await MigrateTaskAttachmentsAsync(cancellationToken);
        }

        private async Task MigrateWorkspaceAvatarsAsync(CancellationToken cancellationToken)
        {
            var legacyWorkspaces = await _dbContext.Workspaces
                .Where(w => w.AvatarObjectKey == null
                    && w.AvatarPath != null
                    && w.AvatarPath.StartsWith("/uploads/spaces/"))
                .ToListAsync(cancellationToken);

            if (legacyWorkspaces.Count == 0)
            {
                return;
            }

            var webRoot = string.IsNullOrWhiteSpace(_environment.WebRootPath)
                ? Path.Combine(_environment.ContentRootPath, "wwwroot")
                : _environment.WebRootPath;

            var migrated = 0;

            foreach (var workspace in legacyWorkspaces)
            {
                try
                {
                    var legacyPath = workspace.AvatarPath ?? string.Empty;
                    var relativePath = legacyPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                    var fullPath = Path.Combine(webRoot, relativePath);
                    if (!File.Exists(fullPath))
                    {
                        continue;
                    }

                    var extension = Path.GetExtension(fullPath);
                    if (string.IsNullOrWhiteSpace(extension))
                    {
                        extension = ".bin";
                    }

                    var objectKey = $"avatars/workspaces/workspace-{workspace.Id}/{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
                    await using var stream = File.OpenRead(fullPath);
                    await _objectStorage.UploadAsync(
                        _storageSettings.PublicBucket,
                        objectKey,
                        stream,
                        ResolveContentType(extension),
                        cancellationToken);

                    workspace.AvatarObjectKey = objectKey;
                    workspace.AvatarPath = BuildPublicFileUrl(objectKey);
                    migrated += 1;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to migrate legacy workspace avatar for workspace {WorkspaceId}", workspace.Id);
                }
            }

            if (migrated > 0)
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
                _logger.LogInformation("Migrated {Count} legacy workspace avatars to object storage", migrated);
            }
        }

        private async Task MigrateTaskAttachmentsAsync(CancellationToken cancellationToken)
        {
            var legacyRoot = Path.Combine(_environment.ContentRootPath, "App_Data", "attachments");
            if (!Directory.Exists(legacyRoot))
            {
                return;
            }

            var taskFolders = Directory.GetDirectories(legacyRoot, "task-*");
            if (taskFolders.Length == 0)
            {
                return;
            }

            var migrated = 0;

            foreach (var folder in taskFolders)
            {
                var taskFolderName = Path.GetFileName(folder);
                if (string.IsNullOrWhiteSpace(taskFolderName)
                    || !taskFolderName.StartsWith("task-", StringComparison.OrdinalIgnoreCase)
                    || !int.TryParse(taskFolderName[5..], out var taskId)
                    || taskId <= 0)
                {
                    continue;
                }

                var taskExists = await _dbContext.Tasks
                    .AsNoTracking()
                    .AnyAsync(t => t.Id == taskId, cancellationToken);
                if (!taskExists)
                {
                    continue;
                }

                var indexPath = Path.Combine(folder, "index.json");
                if (!File.Exists(indexPath))
                {
                    continue;
                }

                var existingIds = await _dbContext.TaskAttachments
                    .AsNoTracking()
                    .Where(a => a.TaskId == taskId)
                    .Select(a => a.Id)
                    .ToListAsync(cancellationToken);

                var knownIds = new HashSet<string>(existingIds, StringComparer.Ordinal);
                var records = await ReadLegacyAttachmentRecordsAsync(indexPath, cancellationToken);
                foreach (var record in records)
                {
                    try
                    {
                        if (knownIds.Contains(record.Id))
                        {
                            continue;
                        }

                        var storedName = string.IsNullOrWhiteSpace(record.StoredName)
                            ? record.Id
                            : record.StoredName;

                        var sourcePath = Path.Combine(folder, storedName);
                        if (!File.Exists(sourcePath))
                        {
                            continue;
                        }

                        var ext = Path.GetExtension(storedName);
                        if (string.IsNullOrWhiteSpace(ext))
                        {
                            ext = Path.GetExtension(record.FileName);
                        }

                        var objectKey = string.IsNullOrWhiteSpace(ext)
                            ? $"attachments/task-{taskId}/{record.Id}"
                            : $"attachments/task-{taskId}/{record.Id}{ext.ToLowerInvariant()}";

                        await using var stream = File.OpenRead(sourcePath);
                        await _objectStorage.UploadAsync(
                            _storageSettings.PrivateBucket,
                            objectKey,
                            stream,
                            string.IsNullOrWhiteSpace(record.ContentType)
                                ? ResolveContentType(ext)
                                : record.ContentType,
                            cancellationToken);

                        var item = new TaskAttachment
                        {
                            Id = record.Id,
                            TaskId = taskId,
                            ObjectKey = objectKey,
                            FileName = string.IsNullOrWhiteSpace(record.FileName) ? "file" : record.FileName,
                            ContentType = string.IsNullOrWhiteSpace(record.ContentType)
                                ? ResolveContentType(ext)
                                : record.ContentType,
                            Size = Math.Max(0, record.Size),
                            UploadedAtUtc = record.UploadedAtUtc == default ? DateTime.UtcNow : record.UploadedAtUtc
                        };

                        await _dbContext.TaskAttachments.AddAsync(item, cancellationToken);
                        knownIds.Add(record.Id);
                        migrated += 1;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to migrate legacy attachment {AttachmentId} for task {TaskId}", record.Id, taskId);
                    }
                }
            }

            if (migrated > 0)
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
                _logger.LogInformation("Migrated {Count} legacy attachments to object storage", migrated);
            }
        }

        private static async Task<IReadOnlyList<LegacyAttachmentRecord>> ReadLegacyAttachmentRecordsAsync(
            string indexPath,
            CancellationToken cancellationToken)
        {
            await using var stream = File.OpenRead(indexPath);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

            if (!document.RootElement.TryGetProperty("Items", out var itemsElement)
                || itemsElement.ValueKind != JsonValueKind.Object)
            {
                return Array.Empty<LegacyAttachmentRecord>();
            }

            var records = new List<LegacyAttachmentRecord>();

            foreach (var entry in itemsElement.EnumerateObject())
            {
                var payload = entry.Value;
                var id = ReadString(payload, "Id");
                if (string.IsNullOrWhiteSpace(id))
                {
                    id = entry.Name;
                }

                if (string.IsNullOrWhiteSpace(id))
                {
                    continue;
                }

                var uploadedAtRaw = ReadString(payload, "UploadedAtUtc");
                var uploadedAtUtc = DateTime.TryParse(uploadedAtRaw, out var parsed)
                    ? parsed.ToUniversalTime()
                    : DateTime.UtcNow;

                records.Add(new LegacyAttachmentRecord
                {
                    Id = id,
                    FileName = ReadString(payload, "FileName"),
                    StoredName = ReadString(payload, "StoredName"),
                    ContentType = ReadString(payload, "ContentType"),
                    Size = ReadLong(payload, "Size"),
                    UploadedAtUtc = uploadedAtUtc
                });
            }

            return records;
        }

        private static string ReadString(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var value)
                || value.ValueKind != JsonValueKind.String)
            {
                return string.Empty;
            }

            return value.GetString() ?? string.Empty;
        }

        private static long ReadLong(JsonElement element, string propertyName)
        {
            if (!element.TryGetProperty(propertyName, out var value))
            {
                return 0;
            }

            if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var number))
            {
                return number;
            }

            if (value.ValueKind == JsonValueKind.String
                && long.TryParse(value.GetString(), out var parsed))
            {
                return parsed;
            }

            return 0;
        }

        private static string ResolveContentType(string extension)
        {
            return (extension ?? string.Empty).ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                ".gif" => "image/gif",
                ".txt" => "text/plain",
                ".pdf" => "application/pdf",
                _ => "application/octet-stream"
            };
        }

        private static string BuildPublicFileUrl(string objectKey)
        {
            return $"/api/public-files?key={Uri.EscapeDataString(objectKey)}";
        }

        private sealed class LegacyAttachmentRecord
        {
            public string Id { get; set; } = string.Empty;
            public string FileName { get; set; } = string.Empty;
            public string StoredName { get; set; } = string.Empty;
            public string ContentType { get; set; } = "application/octet-stream";
            public long Size { get; set; }
            public DateTime UploadedAtUtc { get; set; }
        }
    }
}
