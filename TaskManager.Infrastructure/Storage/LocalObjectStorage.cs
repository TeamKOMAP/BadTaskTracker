using System.IO;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;

namespace TaskManager.Infrastructure.Storage
{
    public class LocalObjectStorage : IObjectStorage
    {
        private readonly string _rootPath;

        public LocalObjectStorage(string contentRootPath, StorageSettings settings)
        {
            var relativeRoot = string.IsNullOrWhiteSpace(settings.LocalRootPath)
                ? "App_Data/object-storage"
                : settings.LocalRootPath.Trim();

            _rootPath = Path.IsPathRooted(relativeRoot)
                ? relativeRoot
                : Path.Combine(contentRootPath, relativeRoot);
        }

        public async Task UploadAsync(
            string bucket,
            string objectKey,
            Stream content,
            string contentType,
            CancellationToken cancellationToken = default)
        {
            var fullPath = GetFullPath(bucket, objectKey);
            var folder = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrWhiteSpace(folder))
            {
                Directory.CreateDirectory(folder);
            }

            if (content.CanSeek)
            {
                content.Position = 0;
            }

            await using var output = File.Create(fullPath);
            await content.CopyToAsync(output, cancellationToken);
            await output.FlushAsync(cancellationToken);
        }

        public Task<Stream?> OpenReadAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            var fullPath = GetFullPath(bucket, objectKey);
            if (!File.Exists(fullPath))
            {
                return Task.FromResult<Stream?>(null);
            }

            Stream stream = File.OpenRead(fullPath);
            return Task.FromResult<Stream?>(stream);
        }

        public Task<bool> DeleteAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            var fullPath = GetFullPath(bucket, objectKey);
            if (!File.Exists(fullPath))
            {
                return Task.FromResult(false);
            }

            File.Delete(fullPath);
            return Task.FromResult(true);
        }

        private string GetFullPath(string bucket, string objectKey)
        {
            var normalizedBucket = NormalizeBucket(bucket);
            var normalizedKey = NormalizeObjectKey(objectKey);

            var parts = normalizedKey
                .Split('/', StringSplitOptions.RemoveEmptyEntries)
                .ToList();

            var fullPath = Path.Combine(new[] { _rootPath, normalizedBucket }.Concat(parts).ToArray());
            var normalizedRoot = Path.GetFullPath(_rootPath);
            var normalizedFullPath = Path.GetFullPath(fullPath);

            if (!normalizedFullPath.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Object key resolves outside of storage root.");
            }

            return normalizedFullPath;
        }

        private static string NormalizeBucket(string? bucket)
        {
            var value = (bucket ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException("Storage bucket is required.");
            }

            return value;
        }

        private static string NormalizeObjectKey(string? objectKey)
        {
            var value = (objectKey ?? string.Empty).Replace('\\', '/').Trim();
            value = value.TrimStart('/');
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException("Storage object key is required.");
            }

            if (value.Contains("..", StringComparison.Ordinal))
            {
                throw new InvalidOperationException("Storage object key is invalid.");
            }

            return value;
        }
    }
}
