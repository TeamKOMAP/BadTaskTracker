using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Services
{
    public class TaskService : ITaskService
    {
        private readonly ITaskRepository _taskRepository;
        private readonly ITagRepository _tagRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
        private readonly IOverdueStatusService _overdueStatusService;

        public TaskService(
            ITaskRepository taskRepository,
            ITagRepository tagRepository,
            IWorkspaceMemberRepository workspaceMemberRepository,
            IOverdueStatusService overdueStatusService)
        {
            _taskRepository = taskRepository;
            _tagRepository = tagRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
            _overdueStatusService = overdueStatusService;
        }

        public async Task<IEnumerable<TaskDto>> GetTasksAsync(
            int workspaceId,
            int actorUserId,
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            await _overdueStatusService.SyncOverdueStatusesAsync(workspaceId);
            var tasks = await _taskRepository.GetAllAsync(workspaceId, status, assigneeId, dueBefore, dueAfter, tagIds);
            return tasks.Select(MapToDto);
        }

        public async Task<TaskDto> GetTaskByIdAsync(int workspaceId, int actorUserId, int id)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            await _overdueStatusService.SyncOverdueStatusesAsync(workspaceId);
            var task = await _taskRepository.GetByIdAsync(id, workspaceId);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {id} not found");
            }
            return MapToDto(task);
        }

        public async Task<TaskDto> CreateTaskAsync(int workspaceId, int actorUserId, CreateTaskDto createTaskDto)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            // Валидация
            ValidateCreateTaskDto(createTaskDto);

            // Проверяем существование пользователя
            if (createTaskDto.AssigneeId.HasValue)
            {
                var assigneeIsMember = await _workspaceMemberRepository.IsMemberAsync(workspaceId, createTaskDto.AssigneeId.Value);
                if (!assigneeIsMember)
                {
                    throw new ValidationException($"User with id {createTaskDto.AssigneeId} is not a member of this workspace");
                }
            }

            // Проверяем существование тегов
            if (createTaskDto.TagIds != null && createTaskDto.TagIds.Any())
            {
                var existingTagsCount = await _tagRepository.CountExistingAsync(workspaceId, createTaskDto.TagIds);

                if (existingTagsCount != createTaskDto.TagIds.Count)
                {
                    throw new ValidationException("One or more tag IDs are invalid");
                }
            }

            var task = new TaskItem
            {
                Title = createTaskDto.Title,
                Description = createTaskDto.Description,
                Status = TaskItemStatus.New,
                WorkspaceId = workspaceId,
                AssigneeId = createTaskDto.AssigneeId,
                DueDate = createTaskDto.DueDate,
                Priority = createTaskDto.Priority,
                CreatedAt = DateTime.UtcNow
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

        public async Task<TaskDto> UpdateTaskAsync(int workspaceId, int actorUserId, UpdateTaskDto updateTaskDto)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            // Валидация
            ValidateUpdateTaskDto(updateTaskDto);

            var task = await _taskRepository.GetByIdAsync(updateTaskDto.Id, workspaceId);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {updateTaskDto.Id} not found");
            }

            // Проверяем существование пользователя
            if (updateTaskDto.AssigneeId.HasValue)
            {
                var assigneeIsMember = await _workspaceMemberRepository.IsMemberAsync(workspaceId, updateTaskDto.AssigneeId.Value);
                if (!assigneeIsMember)
                {
                    throw new ValidationException($"User with id {updateTaskDto.AssigneeId} is not a member of this workspace");
                }
            }

            // Проверяем существование тегов
            if (updateTaskDto.TagIds != null && updateTaskDto.TagIds.Any())
            {
                var existingTagsCount = await _tagRepository.CountExistingAsync(workspaceId, updateTaskDto.TagIds);

                if (existingTagsCount != updateTaskDto.TagIds.Count)
                {
                    throw new ValidationException("One or more tag IDs are invalid");
                }
            }

            task.Title = updateTaskDto.Title;
            task.Description = updateTaskDto.Description;
            task.Status = updateTaskDto.Status;
            task.AssigneeId = updateTaskDto.AssigneeId;
            task.DueDate = updateTaskDto.DueDate;
            task.Priority = updateTaskDto.Priority;
            task.UpdatedAt = DateTime.UtcNow;

            // Автоматически устанавливаем CompletedAt при переводе в Done
            if (updateTaskDto.Status == TaskItemStatus.Done && !task.CompletedAt.HasValue)
            {
                task.CompletedAt = DateTime.UtcNow;
            }
            // Сбрасываем CompletedAt если задача вышла из статуса Done
            else if (updateTaskDto.Status != TaskItemStatus.Done && task.CompletedAt.HasValue)
            {
                task.CompletedAt = null;
            }

            if (updateTaskDto.TagIds != null)
            {
                task.TaskTags.Clear();
                foreach (var tagId in updateTaskDto.TagIds)
                {
                    task.TaskTags.Add(new TaskTag { TagId = tagId });
                }
            }

            await _taskRepository.UpdateAsync(task);
            return MapToDto(task);
        }

        public async Task DeleteTaskAsync(int workspaceId, int actorUserId, int id)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);

            var task = await _taskRepository.GetByIdAsync(id, workspaceId);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {id} not found");
            }

            await _taskRepository.DeleteAsync(task);
        }

        private async Task EnsureMemberAsync(int workspaceId, int actorUserId)
        {
            var isMember = await _workspaceMemberRepository.IsMemberAsync(workspaceId, actorUserId);
            if (!isMember)
            {
                throw new ForbiddenException("You are not a member of this workspace");
            }
        }

        // Приватные методы валидации
        private void ValidateCreateTaskDto(CreateTaskDto dto)
        {
            var errors = new List<string>();

            if (string.IsNullOrWhiteSpace(dto.Title))
                errors.Add("Title is required");
            else if (dto.Title.Length < 3 || dto.Title.Length > 200)
                errors.Add("Title must be between 3 and 200 characters");

            if (dto.DueDate == default)
                errors.Add("Due date is required");

            if (!Enum.IsDefined(typeof(TaskPriority), dto.Priority))
                errors.Add("Invalid priority value");

            if (errors.Any())
            {
                throw new ValidationException(string.Join("; ", errors));
            }
        }

        private void ValidateUpdateTaskDto(UpdateTaskDto dto)
        {
            var errors = new List<string>();

            if (string.IsNullOrWhiteSpace(dto.Title))
                errors.Add("Title is required");
            else if (dto.Title.Length < 3 || dto.Title.Length > 200)
                errors.Add("Title must be between 3 and 200 characters");

            if (dto.DueDate <= DateTime.UtcNow)
                errors.Add("Due date must be in the future");

            if (!Enum.IsDefined(typeof(TaskPriority), dto.Priority))
                errors.Add("Invalid priority value");

            if (!Enum.IsDefined(typeof(TaskItemStatus), dto.Status))
                errors.Add("Invalid status value");

            if (errors.Any())
            {
                throw new ValidationException(string.Join("; ", errors));
            }
        }

        private TaskDto MapToDto(TaskItem task)
        {
            return new TaskDto
            {
                Id = task.Id,
                WorkspaceId = task.WorkspaceId,
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
                TagIds = task.TaskTags.Select(tt => tt.TagId).ToList(),
                IsOverdue = task.Status != TaskItemStatus.Done && task.DueDate < DateTime.UtcNow
            };
        }
    }
}
