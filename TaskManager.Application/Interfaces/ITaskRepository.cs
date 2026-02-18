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
    }
}
