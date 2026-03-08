using System.IO;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Npgsql;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;

namespace TaskManager.Infrastructure.Storage
{
    public class PostgresObjectStorage : IObjectStorage
    {
        private static readonly Regex IdentifierRegex = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

        private readonly string _connectionString;
        private readonly string _schemaName;
        private readonly string _tableName;
        private readonly string _qualifiedTable;

        private readonly SemaphoreSlim _initGate = new(1, 1);
        private volatile bool _isInitialized;

        public PostgresObjectStorage(StorageSettings settings, IConfiguration configuration)
        {
            var schemaName = (settings.PostgresSchema ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(schemaName))
            {
                schemaName = "public";
            }

            var tableName = (settings.PostgresTable ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(tableName))
            {
                tableName = "object_storage_items";
            }

            ValidateIdentifier(schemaName, nameof(settings.PostgresSchema));
            ValidateIdentifier(tableName, nameof(settings.PostgresTable));

            _schemaName = schemaName;
            _tableName = tableName;
            _qualifiedTable = $"\"{_schemaName}\".\"{_tableName}\"";

            _connectionString = ResolveConnectionString(settings, configuration);
            _ = new NpgsqlConnectionStringBuilder(_connectionString);
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
            var payload = await ReadAllBytesAsync(content, cancellationToken);

            await EnsureInitializedAsync(cancellationToken);

            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            await using var command = connection.CreateCommand();
            command.CommandText = $@"
INSERT INTO {_qualifiedTable}
    (bucket, object_key, content, content_type, size, created_at_utc, updated_at_utc)
VALUES
    (@bucket, @objectKey, @content, @contentType, @size, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (bucket, object_key)
DO UPDATE SET
    content = EXCLUDED.content,
    content_type = EXCLUDED.content_type,
    size = EXCLUDED.size,
    updated_at_utc = CURRENT_TIMESTAMP;";

            command.Parameters.AddWithValue("bucket", normalizedBucket);
            command.Parameters.AddWithValue("objectKey", normalizedObjectKey);
            command.Parameters.AddWithValue("content", payload);
            command.Parameters.AddWithValue(
                "contentType",
                string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType);
            command.Parameters.AddWithValue("size", payload.LongLength);

            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        public async Task<Stream?> OpenReadAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            var normalizedBucket = NormalizeBucket(bucket);
            var normalizedObjectKey = NormalizeObjectKey(objectKey);

            await EnsureInitializedAsync(cancellationToken);

            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            await using var command = connection.CreateCommand();
            command.CommandText = $@"
SELECT content
FROM {_qualifiedTable}
WHERE bucket = @bucket
  AND object_key = @objectKey
LIMIT 1;";

            command.Parameters.AddWithValue("bucket", normalizedBucket);
            command.Parameters.AddWithValue("objectKey", normalizedObjectKey);

            var scalar = await command.ExecuteScalarAsync(cancellationToken);
            if (scalar is not byte[] payload)
            {
                return null;
            }

            return new MemoryStream(payload, writable: false);
        }

        public async Task<bool> DeleteAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            var normalizedBucket = NormalizeBucket(bucket);
            var normalizedObjectKey = NormalizeObjectKey(objectKey);

            await EnsureInitializedAsync(cancellationToken);

            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);

            await using var command = connection.CreateCommand();
            command.CommandText = $@"
DELETE FROM {_qualifiedTable}
WHERE bucket = @bucket
  AND object_key = @objectKey;";

            command.Parameters.AddWithValue("bucket", normalizedBucket);
            command.Parameters.AddWithValue("objectKey", normalizedObjectKey);

            var affected = await command.ExecuteNonQueryAsync(cancellationToken);
            return affected > 0;
        }

        private async Task EnsureInitializedAsync(CancellationToken cancellationToken)
        {
            if (_isInitialized)
            {
                return;
            }

            await _initGate.WaitAsync(cancellationToken);
            try
            {
                if (_isInitialized)
                {
                    return;
                }

                await using var connection = new NpgsqlConnection(_connectionString);
                await connection.OpenAsync(cancellationToken);

                await using var command = connection.CreateCommand();
                command.CommandText = $@"
CREATE SCHEMA IF NOT EXISTS ""{_schemaName}"";

CREATE TABLE IF NOT EXISTS {_qualifiedTable}
(
    bucket         text NOT NULL,
    object_key     text NOT NULL,
    content        bytea NOT NULL,
    content_type   text NOT NULL,
    size           bigint NOT NULL,
    created_at_utc timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at_utc timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bucket, object_key)
);

CREATE INDEX IF NOT EXISTS ""ix_{_tableName}_updated_at_utc""
    ON {_qualifiedTable} (updated_at_utc DESC);";

                await command.ExecuteNonQueryAsync(cancellationToken);
                _isInitialized = true;
            }
            finally
            {
                _initGate.Release();
            }
        }

        private static async Task<byte[]> ReadAllBytesAsync(Stream stream, CancellationToken cancellationToken)
        {
            if (stream.CanSeek)
            {
                stream.Position = 0;
            }

            await using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, cancellationToken);
            return buffer.ToArray();
        }

        private static string ResolveConnectionString(StorageSettings settings, IConfiguration configuration)
        {
            var explicitConnectionString = (settings.PostgresConnectionString ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(explicitConnectionString))
            {
                return explicitConnectionString;
            }

            var fromConnectionStrings = configuration.GetConnectionString("Postgres");
            if (!string.IsNullOrWhiteSpace(fromConnectionStrings))
            {
                return fromConnectionStrings;
            }

            throw new InvalidOperationException(
                "PostgreSQL storage provider requires a connection string in Storage:PostgresConnectionString or ConnectionStrings:Postgres.");
        }

        private static void ValidateIdentifier(string value, string fieldName)
        {
            if (!IdentifierRegex.IsMatch(value))
            {
                throw new InvalidOperationException($"{fieldName} contains invalid characters.");
            }
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
