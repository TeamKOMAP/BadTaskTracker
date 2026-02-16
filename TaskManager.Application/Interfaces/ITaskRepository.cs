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
        Task<int> UpdateOverdueStatusesAsync(int workspaceId, DateTime utcNow);
    }
}
