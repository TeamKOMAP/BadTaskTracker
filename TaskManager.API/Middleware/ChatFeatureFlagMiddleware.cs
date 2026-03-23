using Microsoft.Extensions.Options;
using TaskManager.Chat.Application.Configuration;

namespace TaskManager.API.Middleware;

public sealed class ChatFeatureFlagMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IOptionsMonitor<ChatSettings> _chatSettings;

    public ChatFeatureFlagMiddleware(RequestDelegate next, IOptionsMonitor<ChatSettings> chatSettings)
    {
        _next = next;
        _chatSettings = chatSettings;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (_chatSettings.CurrentValue.Enabled || !IsChatPath(context.Request.Path))
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status404NotFound;
    }

    private static bool IsChatPath(PathString path)
    {
        var value = path.Value;
        if (string.IsNullOrEmpty(value))
        {
            return false;
        }

        return value.StartsWith("/api/chats", StringComparison.OrdinalIgnoreCase)
               || value.StartsWith("/api/tasks/", StringComparison.OrdinalIgnoreCase) && value.Contains("/chat", StringComparison.OrdinalIgnoreCase)
               || value.StartsWith("/hubs/chat", StringComparison.OrdinalIgnoreCase);
    }
}
