using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using System.Text.Json;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure
{
    public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
    {
        public ApplicationDbContext CreateDbContext(string[] args)
        {
            var apiRootPath = ResolveApiRootPath();
            var environmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";

            var provider = (ResolveSetting(
                    apiRootPath,
                    environmentName,
                    "Database__Provider",
                    "Database",
                    "Provider")
                ?? "Sqlite")
                .Trim();
            var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();

            if (provider.Equals("Postgres", StringComparison.OrdinalIgnoreCase)
                || provider.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase)
                || provider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
            {
                var postgresConnection = ResolveSetting(
                    apiRootPath,
                    environmentName,
                    "ConnectionStrings__Postgres",
                    "ConnectionStrings",
                    "Postgres");

                if (string.IsNullOrWhiteSpace(postgresConnection))
                {
                    throw new InvalidOperationException(
                        "ConnectionStrings:Postgres must be configured when Database:Provider=Postgres for EF tooling.");
                }

                optionsBuilder.UseNpgsql(postgresConnection);
                return new ApplicationDbContext(optionsBuilder.Options);
            }

            if (provider.Equals("Sqlite", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(provider))
            {
                var sqliteConnection = ResolveSetting(
                    apiRootPath,
                    environmentName,
                    "ConnectionStrings__DefaultConnection",
                    "ConnectionStrings",
                    "DefaultConnection");

                if (string.IsNullOrWhiteSpace(sqliteConnection))
                {
                    throw new InvalidOperationException(
                        "ConnectionStrings:DefaultConnection must be configured when Database:Provider=Sqlite for EF tooling.");
                }

                optionsBuilder.UseSqlite(sqliteConnection);
                return new ApplicationDbContext(optionsBuilder.Options);
            }

            throw new InvalidOperationException($"Unsupported database provider '{provider}'. Use Sqlite or Postgres.");
        }

        private static string ResolveApiRootPath()
        {
            var current = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (current != null)
            {
                var candidate = Path.Combine(current.FullName, "TaskManager.API");
                if (Directory.Exists(candidate))
                {
                    return candidate;
                }

                current = current.Parent;
            }

            return Directory.GetCurrentDirectory();
        }

        private static string? ResolveSetting(
            string apiRootPath,
            string environmentName,
            string envVariableName,
            params string[] jsonPath)
        {
            var fromEnvironment = Environment.GetEnvironmentVariable(envVariableName);
            if (!string.IsNullOrWhiteSpace(fromEnvironment))
            {
                return fromEnvironment;
            }

            var envSpecificPath = Path.Combine(apiRootPath, $"appsettings.{environmentName}.json");
            var fromEnvSpecific = TryReadJsonValue(envSpecificPath, jsonPath);
            if (!string.IsNullOrWhiteSpace(fromEnvSpecific))
            {
                return fromEnvSpecific;
            }

            var basePath = Path.Combine(apiRootPath, "appsettings.json");
            return TryReadJsonValue(basePath, jsonPath);
        }

        private static string? TryReadJsonValue(string filePath, params string[] jsonPath)
        {
            if (!File.Exists(filePath))
            {
                return null;
            }

            using var stream = File.OpenRead(filePath);
            using var document = JsonDocument.Parse(stream);

            var current = document.RootElement;
            foreach (var part in jsonPath)
            {
                if (current.ValueKind != JsonValueKind.Object
                    || !current.TryGetProperty(part, out current))
                {
                    return null;
                }
            }

            return current.ValueKind == JsonValueKind.String ? current.GetString() : null;
        }
    }
}
