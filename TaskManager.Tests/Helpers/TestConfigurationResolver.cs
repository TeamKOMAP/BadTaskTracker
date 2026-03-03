namespace TaskManager.Tests.Helpers;

internal static class TestConfigurationResolver
{
    public static string ResolveJwtSetting(string key, string fallback)
    {
        var value = Environment.GetEnvironmentVariable(key);
        if (!string.IsNullOrWhiteSpace(value))
        {
            return value;
        }

        var fromDotEnv = ReadValueFromDotEnv(key);
        return string.IsNullOrWhiteSpace(fromDotEnv) ? fallback : fromDotEnv;
    }

    private static string? ReadValueFromDotEnv(string key)
    {
        var filePath = FindDotEnvPath();
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            return null;
        }

        foreach (var rawLine in File.ReadAllLines(filePath))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrWhiteSpace(line)
                || line.StartsWith('#'))
            {
                continue;
            }

            if (line.StartsWith("export ", StringComparison.OrdinalIgnoreCase))
            {
                line = line[7..].Trim();
            }

            var separatorIndex = line.IndexOf('=');
            if (separatorIndex <= 0)
            {
                continue;
            }

            var lineKey = line[..separatorIndex].Trim();
            if (!lineKey.Equals(key, StringComparison.Ordinal))
            {
                continue;
            }

            var lineValue = line[(separatorIndex + 1)..].Trim();
            if (lineValue.Length >= 2
                && ((lineValue[0] == '"' && lineValue[^1] == '"')
                    || (lineValue[0] == '\'' && lineValue[^1] == '\'')))
            {
                lineValue = lineValue[1..^1];
            }

            return lineValue;
        }

        return null;
    }

    private static string? FindDotEnvPath()
    {
        var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (directory != null)
        {
            var candidate = Path.Combine(directory.FullName, ".env");
            if (File.Exists(candidate))
            {
                return candidate;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
