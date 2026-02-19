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
        private readonly IAttachmentStorage _attachmentStorage;

        public TaskService(
            ITaskRepository taskRepository,
            ITagRepository tagRepository,
            IWorkspaceMemberRepository workspaceMemberRepository,
            IAttachmentStorage attachmentStorage)
        {
            _taskRepository = taskRepository;
            _tagRepository = tagRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
            _attachmentStorage = attachmentStorage;
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
            var tasks = (await _taskRepository.GetAllAsync(workspaceId, status, assigneeId, dueBefore, dueAfter, tagIds)).ToList();
            var countsByTaskId = await GetAttachmentCountsByTaskIdAsync(tasks.Select(t => t.Id), CancellationToken.None);

            return tasks.Select(task =>
            {
                var attachmentCount = countsByTaskId.TryGetValue(task.Id, out var count)
                    ? count
                    : 0;
                return MapToDto(task, attachmentCount);
            });
        }

        public async Task<TaskDto> GetTaskByIdAsync(int workspaceId, int actorUserId, int id)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            var task = await _taskRepository.GetByIdAsync(id, workspaceId);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {id} not found");
            }

            var attachmentCount = await GetAttachmentCountForTaskAsync(task.Id, CancellationToken.None);
            return MapToDto(task, attachmentCount);
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
                DueDate = NormalizeIncomingUtc(createTaskDto.DueDate),
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
            await _attachmentStorage.DeleteAllForTaskAsync(createdTask.Id, CancellationToken.None);
            return MapToDto(createdTask, 0);
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
            task.DueDate = NormalizeIncomingUtc(updateTaskDto.DueDate);
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
            var attachmentCount = await GetAttachmentCountForTaskAsync(task.Id, CancellationToken.None);
            return MapToDto(task, attachmentCount);
        }

        public async Task DeleteTaskAsync(int workspaceId, int actorUserId, int id)
        {
            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId);
            if (member == null)
            {
                throw new ForbiddenException("You are not a member of this workspace");
            }
            if (member.Role != WorkspaceRole.Admin && member.Role != WorkspaceRole.Owner)
            {
                throw new ForbiddenException("Only workspace admins or owners can delete tasks");
            }

            var task = await _taskRepository.GetByIdAsync(id, workspaceId);
            if (task == null)
            {
                throw new NotFoundException($"Task with id {id} not found");
            }

            await _taskRepository.DeleteAsync(task);
            await _attachmentStorage.DeleteAllForTaskAsync(task.Id, CancellationToken.None);
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

            if (dto.DueDate == default)
                errors.Add("Due date is required");

            if (!Enum.IsDefined(typeof(TaskPriority), dto.Priority))
                errors.Add("Invalid priority value");

            if (!Enum.IsDefined(typeof(TaskItemStatus), dto.Status))
                errors.Add("Invalid status value");

            if (errors.Any())
            {
                throw new ValidationException(string.Join("; ", errors));
            }
        }

        private async Task<int> GetAttachmentCountForTaskAsync(int taskId, CancellationToken cancellationToken)
        {
            var counts = await _attachmentStorage.CountByTaskIdsAsync(new[] { taskId }, cancellationToken);
            return counts.TryGetValue(taskId, out var count) ? count : 0;
        }

        private async Task<IReadOnlyDictionary<int, int>> GetAttachmentCountsByTaskIdAsync(
            IEnumerable<int> taskIds,
            CancellationToken cancellationToken)
        {
            var ids = taskIds
                .Where(id => id > 0)
                .Distinct()
                .ToList();

            if (ids.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            return await _attachmentStorage.CountByTaskIdsAsync(ids, cancellationToken);
        }

        private TaskDto MapToDto(TaskItem task, int attachmentCount)
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
                DueDate = AsUtc(task.DueDate),
                CreatedAt = AsUtc(task.CreatedAt),
                UpdatedAt = task.UpdatedAt.HasValue ? AsUtc(task.UpdatedAt.Value) : null,
                CompletedAt = task.CompletedAt.HasValue ? AsUtc(task.CompletedAt.Value) : null,
                Priority = task.Priority,
                TagIds = task.TaskTags.Select(tt => tt.TagId).ToList(),
                AttachmentCount = Math.Max(0, attachmentCount),
                IsOverdue = task.Status != TaskItemStatus.Done && task.DueDate < DateTime.UtcNow
            };
        }

        private static DateTime AsUtc(DateTime value)
        {
            // EF/SQLite often materializes DateTime as Unspecified; we treat stored values as UTC.
            return value.Kind == DateTimeKind.Utc
                ? value
                : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }

        private static DateTime NormalizeIncomingUtc(DateTime value)
        {
            // UI sends ISO8601 with Z (UTC). If some client sends without offset, treat as UTC to avoid time drift.
            return value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
            };
        }
    }
}
