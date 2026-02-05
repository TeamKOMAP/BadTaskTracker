using TaskManager.Domain.Entities;

namespace TaskManager.Infrastructure.Repositories
{
    public interface ITaskRepository
    {
        System.Threading.Tasks.Task<System.Collections.Generic.IEnumerable<TaskItem>> GetAllAsync(
            Domain.Enums.TaskItemStatus? status = null,
            int? assigneeId = null,
            System.DateTime? dueBefore = null,
            System.DateTime? dueAfter = null,
            System.Collections.Generic.List<int>? tagIds = null);

        System.Threading.Tasks.Task<TaskItem?> GetByIdAsync(int id);
        System.Threading.Tasks.Task<TaskItem> AddAsync(TaskItem taskItem);
        System.Threading.Tasks.Task UpdateAsync(TaskItem taskItem);
        System.Threading.Tasks.Task DeleteAsync(TaskItem taskItem);
        System.Threading.Tasks.Task<bool> ExistsAsync(int id);
    }
}