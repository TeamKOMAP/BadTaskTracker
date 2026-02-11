using TaskManager.Application.DTOs;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Interfaces
{
    public interface ITaskService
    {
        Task<IEnumerable<TaskDto>> GetTasksAsync(
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null);

        Task<TaskDto> GetTaskByIdAsync(int id);
        Task<TaskDto> CreateTaskAsync(CreateTaskDto createTaskDto);
        Task<TaskDto> UpdateTaskAsync(UpdateTaskDto updateTaskDto); 
        Task DeleteTaskAsync(int id); 
    }
}
