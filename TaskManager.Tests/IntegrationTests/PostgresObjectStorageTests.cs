using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Npgsql;
using TaskManager.Application.Storage;
using TaskManager.Infrastructure.Storage;
using Xunit;

namespace TaskManager.Tests.IntegrationTests;

[Trait("Category", "Storage")]
public class PostgresObjectStorageTests
{
    [PostgresFact]
    public async Task OpenReadAsync_OnFirstCall_InitializesSchemaAndTable()
    {
        await using var context = CreateContext();

        var stream = await context.Storage.OpenReadAsync("gtt-public", "missing/object.txt");

        stream.Should().BeNull();

        await using var connection = new NpgsqlConnection(context.ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = @"
SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = @schema
      AND table_name = @table
);";
        command.Parameters.AddWithValue("schema", context.SchemaName);
        command.Parameters.AddWithValue("table", context.TableName);

        var exists = (bool?)await command.ExecuteScalarAsync();
        exists.Should().BeTrue();
    }

    [PostgresFact]
    public async Task UploadAsync_WhenCalledTwiceForSameKey_UpsertsPayload()
    {
        await using var context = CreateContext();

        await context.Storage.UploadAsync(
            "gtt-public",
            "avatars/user-1.txt",
            ToStream("version-1"),
            "text/plain");

        await context.Storage.UploadAsync(
            "gtt-public",
            "avatars/user-1.txt",
            ToStream("version-2"),
            "text/plain");

        using var stream = await context.Storage.OpenReadAsync("gtt-public", "avatars/user-1.txt");
        stream.Should().NotBeNull();

        var payload = await ReadAllTextAsync(stream!);
        payload.Should().Be("version-2");

        var rows = await CountRowsAsync(context.ConnectionString, context.SchemaName, context.TableName);
        rows.Should().Be(1);
    }

    [PostgresFact]
    public async Task DeleteAsync_RemovesObjectAndReturnsExpectedFlags()
    {
        await using var context = CreateContext();

        await context.Storage.UploadAsync(
            "gtt-private",
            "attachments/task-1/file.txt",
            ToStream("payload"),
            "text/plain");

        var firstDelete = await context.Storage.DeleteAsync("gtt-private", "attachments/task-1/file.txt");
        firstDelete.Should().BeTrue();

        var secondDelete = await context.Storage.DeleteAsync("gtt-private", "attachments/task-1/file.txt");
        secondDelete.Should().BeFalse();

        using var stream = await context.Storage.OpenReadAsync("gtt-private", "attachments/task-1/file.txt");
        stream.Should().BeNull();
    }

    private static async Task<int> CountRowsAsync(string connectionString, string schemaName, string tableName)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = $"SELECT COUNT(*) FROM \"{schemaName}\".\"{tableName}\";";

        var result = await command.ExecuteScalarAsync();
        return Convert.ToInt32(result);
    }

    private static Stream ToStream(string value)
    {
        return new MemoryStream(Encoding.UTF8.GetBytes(value));
    }

    private static async Task<string> ReadAllTextAsync(Stream stream)
    {
        using var reader = new StreamReader(
            stream,
            Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false,
            bufferSize: 1024,
            leaveOpen: false);
        return await reader.ReadToEndAsync();
    }

    private static TestContext CreateContext()
    {
        var connectionString = ResolveConnectionString();
        var schemaName = $"btt_storage_test_{Guid.NewGuid():N}";
        var tableName = "objects";

        var settings = new StorageSettings
        {
            Provider = "Postgres",
            PostgresConnectionString = connectionString,
            PostgresSchema = schemaName,
            PostgresTable = tableName
        };

        var configuration = new ConfigurationBuilder().Build();
        var storage = new PostgresObjectStorage(settings, configuration);

        return new TestContext(connectionString, schemaName, tableName, storage);
    }

    private static string ResolveConnectionString()
    {
        var preferred = Environment.GetEnvironmentVariable(PostgresFactAttribute.PrimaryEnvVar);
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred;
        }

        var fallback = Environment.GetEnvironmentVariable(PostgresFactAttribute.FallbackEnvVar);
        if (!string.IsNullOrWhiteSpace(fallback))
        {
            return fallback;
        }

        throw new InvalidOperationException("PostgreSQL connection string is not configured for storage tests.");
    }

    private sealed class TestContext(string connectionString, string schemaName, string tableName, PostgresObjectStorage storage) : IAsyncDisposable
    {
        public string ConnectionString { get; } = connectionString;
        public string SchemaName { get; } = schemaName;
        public string TableName { get; } = tableName;
        public PostgresObjectStorage Storage { get; } = storage;

        public async ValueTask DisposeAsync()
        {
            await using var connection = new NpgsqlConnection(ConnectionString);
            await connection.OpenAsync();

            await using var command = connection.CreateCommand();
            command.CommandText = $"DROP SCHEMA IF EXISTS \"{SchemaName}\" CASCADE;";
            await command.ExecuteNonQueryAsync();
        }
    }

    private sealed class PostgresFactAttribute : FactAttribute
    {
        public const string PrimaryEnvVar = "TEST_POSTGRES_CONNECTION_STRING";
        public const string FallbackEnvVar = "ConnectionStrings__Postgres";

        public PostgresFactAttribute()
        {
            var hasPrimary = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(PrimaryEnvVar));
            var hasFallback = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(FallbackEnvVar));

            if (!hasPrimary && !hasFallback)
            {
                Skip = $"Set {PrimaryEnvVar} or {FallbackEnvVar} to run PostgreSQL storage tests.";
            }
        }
    }
}
