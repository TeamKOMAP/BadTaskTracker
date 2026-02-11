using TaskManager.Application.DTOs;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Interfaces
{
    public interface ITaskService
    {
        Task<IEnumerable<TaskDto>> GetTasksAsync(
            int workspaceId,
            int actorUserId,
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null);

        Task<TaskDto> GetTaskByIdAsync(int workspaceId, int actorUserId, int id);
        Task<TaskDto> CreateTaskAsync(int workspaceId, int actorUserId, CreateTaskDto createTaskDto);
        Task<TaskDto> UpdateTaskAsync(int workspaceId, int actorUserId, UpdateTaskDto updateTaskDto);
        Task DeleteTaskAsync(int workspaceId, int actorUserId, int id);
    }
}
