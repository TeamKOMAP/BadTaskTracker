using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Amazon.S3.Util;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;

namespace TaskManager.Infrastructure.Storage
{
    public class S3ObjectStorage : IObjectStorage
    {
        private readonly IAmazonS3 _s3Client;
        private readonly SemaphoreSlim _bucketGate = new(1, 1);
        private readonly HashSet<string> _knownBuckets = new(StringComparer.OrdinalIgnoreCase);

        public S3ObjectStorage(StorageSettings settings)
        {
            var config = new AmazonS3Config
            {
                ForcePathStyle = settings.ForcePathStyle
            };

            if (!string.IsNullOrWhiteSpace(settings.Endpoint))
            {
                config.ServiceURL = settings.Endpoint.Trim();
            }
            else
            {
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(
                    string.IsNullOrWhiteSpace(settings.Region)
                        ? "us-east-1"
                        : settings.Region.Trim());
            }

            if (!string.IsNullOrWhiteSpace(settings.AccessKey)
                && !string.IsNullOrWhiteSpace(settings.SecretKey))
            {
                _s3Client = new AmazonS3Client(
                    new BasicAWSCredentials(settings.AccessKey, settings.SecretKey),
                    config);
            }
            else
            {
                _s3Client = new AmazonS3Client(config);
            }
        }

        public async Task UploadAsync(
            string bucket,
            string objectKey,
            Stream content,
            string contentType,
            CancellationToken cancellationToken = default)
        {
            var normalizedBucket = NormalizeBucket(bucket);
            var normalizedObjectKey = NormalizeObjectKey(objectKey);

            await EnsureBucketExistsAsync(normalizedBucket, cancellationToken);

            if (content.CanSeek)
            {
                content.Position = 0;
            }

            try
            {
                await PutObjectAsync(normalizedBucket, normalizedObjectKey, content, contentType, cancellationToken);
            }
            catch (AmazonS3Exception ex)
                when (string.Equals(ex.ErrorCode, "NoSuchBucket", StringComparison.OrdinalIgnoreCase))
            {
                await InvalidateBucketAndEnsureExistsAsync(normalizedBucket, cancellationToken);
                if (content.CanSeek)
                {
                    content.Position = 0;
                }

                await PutObjectAsync(normalizedBucket, normalizedObjectKey, content, contentType, cancellationToken);
            }
        }

        public async Task<Stream?> OpenReadAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            var normalizedBucket = NormalizeBucket(bucket);
            var normalizedObjectKey = NormalizeObjectKey(objectKey);

            try
            {
                using var response = await _s3Client.GetObjectAsync(
                    normalizedBucket,
                    normalizedObjectKey,
                    cancellationToken);

                var stream = new MemoryStream();
                await response.ResponseStream.CopyToAsync(stream, cancellationToken);
                stream.Position = 0;
                return stream;
            }
            catch (AmazonS3Exception ex)
                when (ex.StatusCode == System.Net.HttpStatusCode.NotFound
                    || string.Equals(ex.ErrorCode, "NoSuchKey", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(ex.ErrorCode, "NoSuchBucket", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }
        }

        public async Task<bool> DeleteAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            var normalizedBucket = NormalizeBucket(bucket);
            var normalizedObjectKey = NormalizeObjectKey(objectKey);

            try
            {
                await _s3Client.DeleteObjectAsync(new DeleteObjectRequest
                {
                    BucketName = normalizedBucket,
                    Key = normalizedObjectKey
                }, cancellationToken);

                return true;
            }
            catch (AmazonS3Exception ex)
                when (ex.StatusCode == System.Net.HttpStatusCode.NotFound
                    || string.Equals(ex.ErrorCode, "NoSuchKey", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(ex.ErrorCode, "NoSuchBucket", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
        }

        private async Task EnsureBucketExistsAsync(string bucket, CancellationToken cancellationToken)
        {
            if (_knownBuckets.Contains(bucket))
            {
                return;
            }

            await _bucketGate.WaitAsync(cancellationToken);
            try
            {
                if (_knownBuckets.Contains(bucket))
                {
                    return;
                }

                var exists = await AmazonS3Util.DoesS3BucketExistV2Async(_s3Client, bucket);
                if (!exists)
                {
                    await _s3Client.PutBucketAsync(new PutBucketRequest
                    {
                        BucketName = bucket
                    }, cancellationToken);
                }

                _knownBuckets.Add(bucket);
            }
            finally
            {
                _bucketGate.Release();
            }
        }

        private async Task InvalidateBucketAndEnsureExistsAsync(string bucket, CancellationToken cancellationToken)
        {
            await _bucketGate.WaitAsync(cancellationToken);
            try
            {
                _knownBuckets.Remove(bucket);
            }
            finally
            {
                _bucketGate.Release();
            }

            await EnsureBucketExistsAsync(bucket, cancellationToken);
        }

        private Task PutObjectAsync(
            string bucket,
            string objectKey,
            Stream content,
            string contentType,
            CancellationToken cancellationToken)
        {
            return _s3Client.PutObjectAsync(new PutObjectRequest
            {
                BucketName = bucket,
                Key = objectKey,
                InputStream = content,
                ContentType = string.IsNullOrWhiteSpace(contentType)
                    ? "application/octet-stream"
                    : contentType,
                AutoCloseStream = false
            }, cancellationToken);
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
