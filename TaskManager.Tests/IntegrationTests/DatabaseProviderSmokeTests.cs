using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;
using Xunit;

namespace TaskManager.Tests.IntegrationTests;

[Collection("EnvironmentVariables")]
[Trait("Category", "Smoke")]
public class DatabaseProviderSmokeTests
{
    [Fact]
    public async Task Healthz_WithSqliteProvider_ReturnsOk()
    {
        var sqlitePath = Path.Combine(
            Path.GetTempPath(),
            "BadTaskTracker.Tests",
            $"smoke_{Guid.NewGuid():N}.sqlite");

        Directory.CreateDirectory(Path.GetDirectoryName(sqlitePath)!);

        using var env = new TemporaryEnvironmentVariables(new Dictionary<string, string?>
        {
            ["ASPNETCORE_ENVIRONMENT"] = "Development",
            ["Database__Provider"] = "Sqlite",
            ["ConnectionStrings__DefaultConnection"] = $"Data Source={sqlitePath}",
            ["ConnectionStrings__Postgres"] = string.Empty,
            ["DatabaseStartup__ApplyMigrations"] = "true",
            ["DatabaseStartup__Seed"] = "false",
            ["DatabaseStartup__MigrateLegacyFiles"] = "false",
            ["DatabaseStartup__SmokeCheckConnection"] = "true",
            ["DatabaseStartup__FailFast"] = "true"
        });

        try
        {
            using var factory = CreateFactory();
            using var client = factory.CreateClient();

            var response = await client.GetAsync("/healthz");
            var body = await response.Content.ReadAsStringAsync();

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            body.Should().Contain("\"status\":\"ok\"");
            body.Should().Contain("\"database\":\"ok\"");
        }
        finally
        {
            TryDeleteFile(sqlitePath);
            TryDeleteFile($"{sqlitePath}-shm");
            TryDeleteFile($"{sqlitePath}-wal");
        }
    }

    [PostgresFact]
    public async Task Healthz_WithPostgresProvider_ReturnsOk()
    {
        await using var temporaryDatabase = await TemporaryPostgresDatabase.CreateAsync();
        using var env = new TemporaryEnvironmentVariables(new Dictionary<string, string?>
        {
            ["ASPNETCORE_ENVIRONMENT"] = "Development",
            ["Database__Provider"] = "Postgres",
            ["ConnectionStrings__Postgres"] = temporaryDatabase.ConnectionString,
            ["DatabaseStartup__ApplyMigrations"] = "true",
            ["DatabaseStartup__Seed"] = "false",
            ["DatabaseStartup__MigrateLegacyFiles"] = "false",
            ["DatabaseStartup__SmokeCheckConnection"] = "true",
            ["DatabaseStartup__FailFast"] = "true"
        });

        using var factory = CreateFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/healthz");
        var body = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        body.Should().Contain("\"status\":\"ok\"");
        body.Should().Contain("\"database\":\"ok\"");
    }

    private static WebApplicationFactory<Program> CreateFactory()
    {
        return new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder => builder.UseEnvironment("Development"));
    }

    private static void TryDeleteFile(string filePath)
    {
        try
        {
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }
        catch
        {
            // best effort cleanup
        }
    }

    private sealed class TemporaryEnvironmentVariables : IDisposable
    {
        private readonly Dictionary<string, string?> _originalValues = new(StringComparer.Ordinal);

        public TemporaryEnvironmentVariables(Dictionary<string, string?> values)
        {
            foreach (var entry in values)
            {
                _originalValues[entry.Key] = Environment.GetEnvironmentVariable(entry.Key);
                Environment.SetEnvironmentVariable(entry.Key, entry.Value);
            }
        }

        public void Dispose()
        {
            foreach (var original in _originalValues)
            {
                Environment.SetEnvironmentVariable(original.Key, original.Value);
            }
        }
    }

    private sealed class TemporaryPostgresDatabase : IAsyncDisposable
    {
        private readonly string _adminConnectionString;

        private TemporaryPostgresDatabase(string connectionString, string adminConnectionString, string databaseName)
        {
            ConnectionString = connectionString;
            _adminConnectionString = adminConnectionString;
            DatabaseName = databaseName;
        }

        public string ConnectionString { get; }
        public string DatabaseName { get; }

        public static async Task<TemporaryPostgresDatabase> CreateAsync()
        {
            var sourceConnectionString = ResolvePostgresConnectionString();
            var sourceBuilder = new NpgsqlConnectionStringBuilder(sourceConnectionString);

            var adminDatabase = string.IsNullOrWhiteSpace(sourceBuilder.Database)
                ? "postgres"
                : sourceBuilder.Database;

            var adminBuilder = new NpgsqlConnectionStringBuilder(sourceConnectionString)
            {
                Database = adminDatabase
            };

            var databaseName = $"btt_smoke_{Guid.NewGuid():N}";

            await using (var adminConnection = new NpgsqlConnection(adminBuilder.ConnectionString))
            {
                await adminConnection.OpenAsync();

                await using var createCommand = adminConnection.CreateCommand();
                createCommand.CommandText = $"CREATE DATABASE \"{databaseName}\";";
                await createCommand.ExecuteNonQueryAsync();
            }

            var testBuilder = new NpgsqlConnectionStringBuilder(sourceConnectionString)
            {
                Database = databaseName
            };

            return new TemporaryPostgresDatabase(
                testBuilder.ConnectionString,
                adminBuilder.ConnectionString,
                databaseName);
        }

        public async ValueTask DisposeAsync()
        {
            await using var adminConnection = new NpgsqlConnection(_adminConnectionString);
            await adminConnection.OpenAsync();

            await using (var terminateCommand = adminConnection.CreateCommand())
            {
                terminateCommand.CommandText = @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = @dbName
  AND pid <> pg_backend_pid();";
                terminateCommand.Parameters.AddWithValue("dbName", DatabaseName);
                await terminateCommand.ExecuteNonQueryAsync();
            }

            await using var dropCommand = adminConnection.CreateCommand();
            dropCommand.CommandText = $"DROP DATABASE IF EXISTS \"{DatabaseName}\";";
            await dropCommand.ExecuteNonQueryAsync();
        }

        private static string ResolvePostgresConnectionString()
        {
            var fromPrimary = Environment.GetEnvironmentVariable(PostgresFactAttribute.PrimaryEnvVar);
            if (!string.IsNullOrWhiteSpace(fromPrimary))
            {
                return fromPrimary;
            }

            var fromFallback = Environment.GetEnvironmentVariable(PostgresFactAttribute.FallbackEnvVar);
            if (!string.IsNullOrWhiteSpace(fromFallback))
            {
                return fromFallback;
            }

            throw new InvalidOperationException("PostgreSQL connection string is not configured for smoke tests.");
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
                Skip = $"Set {PrimaryEnvVar} or {FallbackEnvVar} to run PostgreSQL smoke tests.";
            }
        }
    }
}

[CollectionDefinition("EnvironmentVariables", DisableParallelization = true)]
public sealed class EnvironmentVariablesCollectionDefinition
{
}
