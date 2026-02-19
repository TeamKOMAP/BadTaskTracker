using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class NotificationRepository : INotificationRepository
    {
        private readonly ApplicationDbContext _context;

        public NotificationRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task AddAsync(
            Notification notification,
            CancellationToken cancellationToken = default,
            bool saveChanges = true)
        {
            await _context.Notifications.AddAsync(notification, cancellationToken);
            if (saveChanges)
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
        }

        public async Task AddRangeAsync(
            IEnumerable<Notification> notifications,
            CancellationToken cancellationToken = default,
            bool saveChanges = true)
        {
            var batch = notifications?
                .Where(n => n != null)
                .ToList() ?? new List<Notification>();

            if (batch.Count == 0)
            {
                return;
            }

            await _context.Notifications.AddRangeAsync(batch, cancellationToken);
            if (saveChanges)
            {
                await _context.SaveChangesAsync(cancellationToken);
            }
        }

        public async Task<List<Notification>> GetUserNotificationsAsync(
            int userId,
            bool unreadOnly = false,
            int take = 50,
            CancellationToken cancellationToken = default)
        {
            var safeTake = Math.Clamp(take, 1, 200);

            var query = _context.Notifications
                .AsNoTracking()
                .Where(n => n.UserId == userId);

            if (unreadOnly)
            {
                query = query.Where(n => !n.IsRead);
            }

            return await query
                .OrderByDescending(n => n.CreatedAt)
                .Take(safeTake)
                .ToListAsync(cancellationToken);
        }

        public async Task<bool> MarkAsReadAsync(int notificationId, int userId, CancellationToken cancellationToken = default)
        {
            var notification = await _context.Notifications
                .FirstOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId, cancellationToken);
            if (notification == null)
            {
                return false;
            }

            if (notification.IsRead)
            {
                return true;
            }

            notification.IsRead = true;
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<int> MarkAllAsReadAsync(int userId, CancellationToken cancellationToken = default)
        {
            var unread = await _context.Notifications
                .Where(n => n.UserId == userId && !n.IsRead)
                .ToListAsync(cancellationToken);

            foreach (var n in unread)
            {
                n.IsRead = true;
            }

            if (unread.Count > 0)
            {
                await _context.SaveChangesAsync(cancellationToken);
            }

            return unread.Count;
        }

        public Task<int> GetUnreadCountAsync(int userId, CancellationToken cancellationToken = default)
        {
            return _context.Notifications
                .AsNoTracking()
                .CountAsync(n => n.UserId == userId && !n.IsRead, cancellationToken);
        }

        public Task<bool> ExistsByActionUrlAsync(
            int userId,
            string type,
            string actionUrl,
            CancellationToken cancellationToken = default)
        {
            var normalizedType = type.Trim();
            var normalizedActionUrl = actionUrl.Trim();

            return _context.Notifications
                .AsNoTracking()
                .AnyAsync(n =>
                    n.UserId == userId
                    && n.Type == normalizedType
                    && n.ActionUrl == normalizedActionUrl,
                    cancellationToken);
        }

        public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
