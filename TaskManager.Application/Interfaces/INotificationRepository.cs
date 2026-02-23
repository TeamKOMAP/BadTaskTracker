using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface INotificationRepository
    {
        Task AddAsync(
            Notification notification,
            CancellationToken cancellationToken = default,
            bool saveChanges = true);
        Task AddRangeAsync(
            IEnumerable<Notification> notifications,
            CancellationToken cancellationToken = default,
            bool saveChanges = true);
        Task<List<Notification>> GetUserNotificationsAsync(
            int userId,
            bool unreadOnly = false,
            int take = 50,
            CancellationToken cancellationToken = default);
        Task<bool> MarkAsReadAsync(int notificationId, int userId, CancellationToken cancellationToken = default);
        Task<int> MarkAllAsReadAsync(int userId, CancellationToken cancellationToken = default);
        Task<int> GetUnreadCountAsync(int userId, CancellationToken cancellationToken = default);
        Task<bool> ExistsByActionUrlAsync(
            int userId,
            string type,
            string actionUrl,
            CancellationToken cancellationToken = default);
        Task SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
