using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;

namespace TaskManager.API.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class NotificationsController : ControllerBase
    {
        private readonly INotificationRepository _notificationRepo;

        public NotificationsController(INotificationRepository notificationRepo)
        {
            _notificationRepo = notificationRepo;
        }

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
                CreatedAt = n.CreatedAt
            }));
        }

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
