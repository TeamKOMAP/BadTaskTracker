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
        private readonly IUserRepository _userRepository;
        private readonly ITagRepository _tagRepository;
        private readonly IOverdueStatusService _overdueStatusService;

        public TaskService(
            ITaskRepository taskRepository,
            IUserRepository userRepository,
            ITagRepository tagRepository,
            IOverdueStatusService overdueStatusService)
        {
            _taskRepository = taskRepository;
            _userRepository = userRepository;
            _tagRepository = tagRepository;
            _overdueStatusService = overdueStatusService;
        }

        public async Task<IEnumerable<TaskDto>> GetTasksAsync(
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null)
        {
            await _overdueStatusService.SyncOverdueStatusesAsync();
            var tasks = await _taskRepository.GetAllAsync(status, assigneeId, dueBefore, dueAfter, tagIds);
            return tasks.Select(MapToDto);
        }

        public async Task<TaskDto> GetTaskByIdAsync(int id)
        {
            await _overdueStatusService.SyncOverdueStatusesAsync();
            var task = await _taskRepository.GetByIdAsync(id);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {id} not found");
            }
            return MapToDto(task);
        }

        public async Task<TaskDto> CreateTaskAsync(CreateTaskDto createTaskDto)
        {
            // Валидация
            ValidateCreateTaskDto(createTaskDto);

            // Проверяем существование пользователя
            if (createTaskDto.AssigneeId.HasValue)
            {
                var userExists = await _userRepository.ExistsAsync(createTaskDto.AssigneeId.Value);
                if (!userExists)
                {
                    throw new ValidationException($"User with id {createTaskDto.AssigneeId} not found");
                }
            }

            // Проверяем существование тегов
            if (createTaskDto.TagIds != null && createTaskDto.TagIds.Any())
            {
                var existingTagsCount = await _tagRepository.CountExistingAsync(createTaskDto.TagIds);

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

        public async Task<TaskDto> UpdateTaskAsync(UpdateTaskDto updateTaskDto)
        {
            // Валидация
            ValidateUpdateTaskDto(updateTaskDto);

            var task = await _taskRepository.GetByIdAsync(updateTaskDto.Id);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {updateTaskDto.Id} not found");
            }

            // Проверяем существование пользователя
            if (updateTaskDto.AssigneeId.HasValue)
            {
                var userExists = await _userRepository.ExistsAsync(updateTaskDto.AssigneeId.Value);
                if (!userExists)
                {
                    throw new ValidationException($"User with id {updateTaskDto.AssigneeId} not found");
                }
            }

            // Проверяем существование тегов
            if (updateTaskDto.TagIds != null && updateTaskDto.TagIds.Any())
            {
                var existingTagsCount = await _tagRepository.CountExistingAsync(updateTaskDto.TagIds);

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

        public async Task DeleteTaskAsync(int id)
        {
            var task = await _taskRepository.GetByIdAsync(id);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {id} not found");
            }

            await _taskRepository.DeleteAsync(task);
        }

        // Приватные методы валидации
        private void ValidateCreateTaskDto(CreateTaskDto dto)
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
