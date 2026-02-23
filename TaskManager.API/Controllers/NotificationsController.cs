using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;

namespace TaskManager.API.Controllers
{
    /// <summary>
    /// Controller for managing user notifications.
    /// </summary>
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class NotificationsController : ControllerBase
    {
        private readonly INotificationRepository _notificationRepo;

        private static DateTime NormalizeUtc(DateTime value)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
            };
        }

        /// <summary>
        /// Initializes a new instance of the NotificationsController.
        /// </summary>
        /// <param name="notificationRepo">The notification repository.</param>
        public NotificationsController(INotificationRepository notificationRepo)
        {
            _notificationRepo = notificationRepo;
        }

        /// <summary>
        /// Gets notifications for the current user.
        /// </summary>
        /// <param name="unreadOnly">If true, returns only unread notifications.</param>
        /// <param name="take">Maximum number of notifications to return.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>List of notifications.</returns>
        /// <response code="200">Returns list of notifications</response>
        /// <response code="401">If user is not authenticated</response>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<NotificationDto>>> GetNotifications(
            [FromQuery] bool unreadOnly = false,
            [FromQuery] int take = 50,
            CancellationToken cancellationToken = default)
        {
            var userId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!userId.HasValue)
            {
                return Unauthorized();
            }

            var notifications = await _notificationRepo.GetUserNotificationsAsync(
                userId.Value,
                unreadOnly,
                take,
                cancellationToken);

            return Ok(notifications.Select(n => new NotificationDto
            {
                Id = n.Id,
                Type = n.Type,
                Title = n.Title,
                Message = n.Message,
                TaskId = n.TaskId,
                WorkspaceId = n.WorkspaceId,
                ActionUrl = n.ActionUrl,
                IsRead = n.IsRead,
                CreatedAt = NormalizeUtc(n.CreatedAt)
            }));
        }

        /// <summary>
        /// Gets the count of unread notifications.
        /// </summary>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>Number of unread notifications.</returns>
        /// <response code="200">Returns unread count</response>
        /// <response code="401">If user is not authenticated</response>
        [HttpGet("unread-count")]
        public async Task<ActionResult<object>> GetUnreadCount(CancellationToken cancellationToken = default)
        {
            var userId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!userId.HasValue)
            {
                return Unauthorized();
            }

            var unread = await _notificationRepo.GetUnreadCountAsync(userId.Value, cancellationToken);
            return Ok(new { unreadCount = unread });
        }

        /// <summary>
        /// Marks a specific notification as read.
        /// </summary>
        /// <param name="id">The notification ID.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>Success if marked as read.</returns>
        /// <response code="200">Notification marked as read</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="404">If notification is not found</response>
        [HttpPost("{id}/read")]
        public async Task<IActionResult> MarkAsRead(int id, CancellationToken cancellationToken = default)
        {
            var userId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!userId.HasValue)
            {
                return Unauthorized();
            }

            var marked = await _notificationRepo.MarkAsReadAsync(id, userId.Value, cancellationToken);
            if (!marked)
            {
                return NotFound();
            }

            return Ok();
        }

        /// <summary>
        /// Marks all notifications as read.
        /// </summary>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>Number of notifications updated.</returns>
        /// <response code="200">All notifications marked as read</response>
        /// <response code="401">If user is not authenticated</response>
        [HttpPost("read-all")]
        public async Task<IActionResult> MarkAllAsRead(CancellationToken cancellationToken = default)
        {
            var userId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!userId.HasValue)
            {
                return Unauthorized();
            }

            var updated = await _notificationRepo.MarkAllAsReadAsync(userId.Value, cancellationToken);
            return Ok(new { updated });
        }
    }
}
