using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Interfaces
{
    public interface ITaskRepository
    {
        Task<IEnumerable<TaskItem>> GetAllAsync(
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null);

        Task<TaskItem?> GetByIdAsync(int id);
        Task<TaskItem> AddAsync(TaskItem taskItem);
        Task UpdateAsync(TaskItem taskItem);
        Task DeleteAsync(TaskItem taskItem);
        Task<bool> ExistsAsync(int id);
        Task<int> UpdateOverdueStatusesAsync(DateTime utcNow);
    }
}
