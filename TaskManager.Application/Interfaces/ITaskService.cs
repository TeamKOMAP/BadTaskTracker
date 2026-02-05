using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface ITaskService
    {
        System.Threading.Tasks.Task<System.Collections.Generic.IEnumerable<TaskDto>> GetTasksAsync(
            Domain.Enums.TaskItemStatus? status = null, 
            int? assigneeId = null,
            System.DateTime? dueBefore = null,
            System.DateTime? dueAfter = null,
            System.Collections.Generic.List<int>? tagIds = null);

        System.Threading.Tasks.Task<TaskDto?> GetTaskByIdAsync(int id);
        System.Threading.Tasks.Task<TaskDto> CreateTaskAsync(CreateTaskDto createTaskDto);
        System.Threading.Tasks.Task<bool> UpdateTaskAsync(UpdateTaskDto updateTaskDto);
        System.Threading.Tasks.Task<bool> DeleteTaskAsync(int id);
    }
}