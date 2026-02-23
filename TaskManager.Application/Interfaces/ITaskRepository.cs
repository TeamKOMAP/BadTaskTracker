using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Interfaces
{
    public interface ITaskRepository
    {
        Task<IEnumerable<TaskItem>> GetAllAsync(
            int workspaceId,
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null);

        Task<TaskItem?> GetByIdAsync(int id, int workspaceId);
        Task<TaskItem> AddAsync(TaskItem taskItem);
        Task UpdateAsync(TaskItem taskItem);
        Task DeleteAsync(TaskItem taskItem);
        Task<bool> ExistsAsync(int id, int workspaceId);
        Task<HashSet<int>> GetExistingIdsAsync(int workspaceId, IReadOnlyCollection<int> taskIds, CancellationToken cancellationToken = default);
        Task<int> UpdateOverdueStatusesAsync(DateTime utcNow, int? workspaceId = null, CancellationToken cancellationToken = default);
        Task<PaginatedResult<TaskItem>> GetPaginatedAsync(int workspaceId, TaskQueryDto query);
        Task<StatusSummaryDto> GetStatusSummaryAsync(int workspaceId, DateTime utcNow, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<OverdueTaskAssigneeRowDto>> GetOverdueTaskRowsAsync(int workspaceId, DateTime utcNow, CancellationToken cancellationToken = default);
        Task<AverageCompletionTimeDto> GetAverageCompletionTimeStatsAsync(int workspaceId, CancellationToken cancellationToken = default);
        
        /// <summary>
        /// Gets tasks that need deadline notifications (due soon and notification not sent yet).
        /// </summary>
        /// <param name="rangeStartUtc">Start of due date range.</param>
        /// <param name="rangeEndUtc">End of due date range.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>List of tasks with assignees that need notifications.</returns>
        Task<IEnumerable<TaskItem>> GetTasksForDeadlineNotificationAsync(
            DateTime rangeStartUtc,
            DateTime rangeEndUtc,
            CancellationToken cancellationToken = default);
        
        /// <summary>
        /// Marks tasks as having deadline notification sent.
        /// </summary>
        /// <param name="taskIds">IDs of tasks to mark.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>Number of tasks updated.</returns>
        Task<int> MarkDeadlineNotificationsSentAsync(
            IEnumerable<int> taskIds,
            CancellationToken cancellationToken = default);
    }
}
