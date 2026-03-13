using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.Exceptions;

namespace TaskManager.API.Middleware;

public sealed class ApiExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ApiExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _environment;

    public ApiExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ApiExceptionHandlingMiddleware> logger,
        IHostEnvironment environment)
    {
        _next = next;
        _logger = logger;
        _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var (statusCode, title) = MapException(exception);

        if (statusCode >= 500)
        {
            _logger.LogError(exception, "Unhandled exception while processing request {Method} {Path}", context.Request.Method, context.Request.Path);
        }

        if (context.Response.HasStarted)
        {
            _logger.LogWarning("Cannot write error response because headers already sent.");
            return;
        }

        context.Response.Clear();
        context.Response.StatusCode = statusCode;

        var problem = new ProblemDetails
        {
            Title = title,
            Status = statusCode,
            Detail = statusCode >= 500 && !_environment.IsDevelopment() ? null : exception.Message,
            Instance = context.Request.Path
        };

        problem.Extensions["traceId"] = context.TraceIdentifier;

        await context.Response.WriteAsJsonAsync(problem);
    }

    private static (int StatusCode, string Title) MapException(Exception exception)
    {
        if (TryMapDatabaseException(exception, out var mapped))
        {
            return mapped;
        }

        return exception switch
        {
            ValidationException => (StatusCodes.Status400BadRequest, "Validation failed"),
            ForbiddenException => (StatusCodes.Status403Forbidden, "Forbidden"),
            NotFoundException => (StatusCodes.Status404NotFound, "Not found"),
            ConflictException => (StatusCodes.Status409Conflict, "Conflict"),
            _ => (StatusCodes.Status500InternalServerError, "Internal server error")
        };
    }

    private static bool TryMapDatabaseException(Exception exception, out (int StatusCode, string Title) mapped)
    {
        if (exception is DbUpdateConcurrencyException)
        {
            mapped = (StatusCodes.Status409Conflict, "Conflict");
            return true;
        }

        if (exception is not DbUpdateException dbUpdateException)
        {
            mapped = default;
            return false;
        }

        var message = dbUpdateException.InnerException?.Message ?? dbUpdateException.Message;

        if (message.Contains("UNIQUE constraint failed", StringComparison.OrdinalIgnoreCase)
            || message.Contains("duplicate key value violates unique constraint", StringComparison.OrdinalIgnoreCase)
            || message.Contains("23505", StringComparison.OrdinalIgnoreCase))
        {
            mapped = (StatusCodes.Status409Conflict, "Conflict");
            return true;
        }

        if (message.Contains("FOREIGN KEY constraint failed", StringComparison.OrdinalIgnoreCase)
            || message.Contains("violates foreign key constraint", StringComparison.OrdinalIgnoreCase)
            || message.Contains("23503", StringComparison.OrdinalIgnoreCase))
        {
            mapped = (StatusCodes.Status409Conflict, "Conflict");
            return true;
        }

        mapped = default;
        return false;
    }
}
