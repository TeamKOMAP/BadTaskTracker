using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Repositories;

namespace TaskManager.Application.Services
{
    public class TaskService : ITaskService
    {
        private readonly ITaskRepository _taskRepository;

        public TaskService(ITaskRepository taskRepository)
        {
            _taskRepository = taskRepository;
        }

        public async System.Threading.Tasks.Task<System.Collections.Generic.IEnumerable<TaskDto>> GetTasksAsync(
            TaskItemStatus? status = null,
            int? assigneeId = null,
            System.DateTime? dueBefore = null,
            System.DateTime? dueAfter = null,
            System.Collections.Generic.List<int>? tagIds = null)
        {
            var tasks = await _taskRepository.GetAllAsync(status, assigneeId, dueBefore, dueAfter, tagIds);
            return tasks.Select(MapToDto);
        }

        public async System.Threading.Tasks.Task<TaskDto?> GetTaskByIdAsync(int id)
        {
            var task = await _taskRepository.GetByIdAsync(id);
            return task != null ? MapToDto(task) : null;
        }

        public async System.Threading.Tasks.Task<TaskDto> CreateTaskAsync(CreateTaskDto createTaskDto)
        {
            var task = new TaskItem
            {
                Title = createTaskDto.Title,
                Description = createTaskDto.Description,
                Status = TaskItemStatus.New,
                AssigneeId = createTaskDto.AssigneeId,
                DueDate = createTaskDto.DueDate,
                Priority = createTaskDto.Priority,
                CreatedAt = System.DateTime.UtcNow
            };

            if (createTaskDto.TagIds != null && createTaskDto.TagIds.Any())
            {
                foreach (var tagId in createTaskDto.TagIds)
                {
                    task.TaskTags.Add(new TaskTag { TagId = tagId });
                }
            }

            var createdTask = await _taskRepository.AddAsync(task);
            return MapToDto(createdTask);
        }

        public async System.Threading.Tasks.Task<bool> UpdateTaskAsync(UpdateTaskDto updateTaskDto)
        {
            var task = await _taskRepository.GetByIdAsync(updateTaskDto.Id);
            if (task == null) return false;

            task.Title = updateTaskDto.Title;
            task.Description = updateTaskDto.Description;
            task.Status = updateTaskDto.Status;
            task.AssigneeId = updateTaskDto.AssigneeId;
            task.DueDate = updateTaskDto.DueDate;
            task.Priority = updateTaskDto.Priority;
            task.UpdatedAt = System.DateTime.UtcNow;

            if (updateTaskDto.TagIds != null)
            {
                task.TaskTags.Clear();
                foreach (var tagId in updateTaskDto.TagIds)
                {
                    task.TaskTags.Add(new TaskTag { TagId = tagId });
                }
            }

            await _taskRepository.UpdateAsync(task);
            return true;
        }

        public async System.Threading.Tasks.Task<bool> DeleteTaskAsync(int id)
        {
            var task = await _taskRepository.GetByIdAsync(id);
            if (task == null) return false;

            await _taskRepository.DeleteAsync(task);
            return true;
        }

        private TaskDto MapToDto(TaskItem task)
        {
            return new TaskDto
            {
                Id = task.Id,
                Title = task.Title,
                Description = task.Description ?? string.Empty,
                Status = task.Status,
                AssigneeId = task.AssigneeId,
                AssigneeName = task.Assignee?.Name,
                DueDate = task.DueDate,
                CreatedAt = task.CreatedAt,
                UpdatedAt = task.UpdatedAt,
                CompletedAt = task.CompletedAt,
                Priority = task.Priority,
                TagIds = task.TaskTags.Select(tt => tt.TagId).ToList()
            };
        }
    }
}