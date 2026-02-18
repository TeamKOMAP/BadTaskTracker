using System.Data;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class TaskRepository : ITaskRepository
    {
        private readonly ApplicationDbContext _context;

        public TaskRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<IEnumerable<TaskItem>> GetAllAsync(
            int workspaceId,
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null)
        {
            var query = _context.Tasks
                .AsNoTracking()
                .Include(t => t.Assignee)
                .Include(t => t.TaskTags)
                    .ThenInclude(tt => tt.Tag)
                .Where(t => t.WorkspaceId == workspaceId)
                .AsQueryable();

            if (status.HasValue)
                query = query.Where(t => t.Status == status.Value);

            if (assigneeId.HasValue)
                query = query.Where(t => t.AssigneeId == assigneeId.Value);

            if (dueBefore.HasValue)
                query = query.Where(t => t.DueDate <= dueBefore.Value);

            if (dueAfter.HasValue)
                query = query.Where(t => t.DueDate >= dueAfter.Value);

            if (tagIds != null && tagIds.Any())
            {
                query = query.Where(t => t.TaskTags.Any(tt => tagIds.Contains(tt.TagId)));
            }

            return await query.ToListAsync();
        }

        public async Task<TaskItem?> GetByIdAsync(int id, int workspaceId)
        {
            return await _context.Tasks
                .Include(t => t.Assignee)
                .Include(t => t.TaskTags)
                    .ThenInclude(tt => tt.Tag)
                .FirstOrDefaultAsync(t => t.Id == id && t.WorkspaceId == workspaceId);
        }

        public async Task<TaskItem> AddAsync(TaskItem taskItem)
        {
            _context.Tasks.Add(taskItem);
            await _context.SaveChangesAsync();
            return taskItem;
        }

        public async Task UpdateAsync(TaskItem taskItem)
        {
            _context.Entry(taskItem).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }

        public async Task DeleteAsync(TaskItem taskItem)
        {
            _context.Tasks.Remove(taskItem);
            await _context.SaveChangesAsync();
        }

        public async Task<bool> ExistsAsync(int id, int workspaceId)
        {
            return await _context.Tasks.AnyAsync(t => t.Id == id && t.WorkspaceId == workspaceId);
        }

        public async Task<HashSet<int>> GetExistingIdsAsync(
            int workspaceId,
            IReadOnlyCollection<int> taskIds,
            CancellationToken cancellationToken = default)
        {
            if (taskIds == null || taskIds.Count == 0)
            {
                return new HashSet<int>();
            }

            var normalizedIds = taskIds
                .Where(id => id > 0)
                .Distinct()
                .ToList();

            if (normalizedIds.Count == 0)
            {
                return new HashSet<int>();
            }

            var existingIds = await _context.Tasks
                .AsNoTracking()
                .Where(t => t.WorkspaceId == workspaceId && normalizedIds.Contains(t.Id))
                .Select(t => t.Id)
                .ToListAsync(cancellationToken);

            return existingIds.ToHashSet();
        }

        public async Task<int> UpdateOverdueStatusesAsync(
            DateTime utcNow,
            int? workspaceId = null,
            CancellationToken cancellationToken = default)
        {
            var query = _context.Tasks
                .Where(t => t.Status != TaskItemStatus.Done
                            && t.DueDate < utcNow
                            && t.Status != TaskItemStatus.Overdue);

            if (workspaceId.HasValue)
            {
                query = query.Where(t => t.WorkspaceId == workspaceId.Value);
            }

            if (_context.Database.IsRelational())
            {
                return await query.ExecuteUpdateAsync(setters => setters
                        .SetProperty(t => t.Status, TaskItemStatus.Overdue)
                        .SetProperty(t => t.UpdatedAt, utcNow),
                    cancellationToken);
            }

            var tasksToUpdate = await query.ToListAsync(cancellationToken);
            if (tasksToUpdate.Count == 0)
            {
                return 0;
            }

            foreach (var task in tasksToUpdate)
            {
                task.Status = TaskItemStatus.Overdue;
                task.UpdatedAt = utcNow;
            }

            await _context.SaveChangesAsync(cancellationToken);
            return tasksToUpdate.Count;
        }

        public async Task<StatusSummaryDto> GetStatusSummaryAsync(
            int workspaceId,
            DateTime utcNow,
            CancellationToken cancellationToken = default)
        {
            var summary = await _context.Tasks
                .AsNoTracking()
                .Where(t => t.WorkspaceId == workspaceId)
                .GroupBy(_ => 1)
                .Select(g => new StatusSummaryDto
                {
                    New = g.Count(t => t.Status == TaskItemStatus.New && t.DueDate >= utcNow),
                    InProgress = g.Count(t => t.Status == TaskItemStatus.InProgress && t.DueDate >= utcNow),
                    Done = g.Count(t => t.Status == TaskItemStatus.Done),
                    Overdue = g.Count(t => t.Status != TaskItemStatus.Done
                                            && (t.Status == TaskItemStatus.Overdue || t.DueDate < utcNow)),
                    Total = g.Count()
                })
                .FirstOrDefaultAsync(cancellationToken);

            return summary ?? new StatusSummaryDto();
        }

        public async Task<IReadOnlyList<OverdueTaskAssigneeRowDto>> GetOverdueTaskRowsAsync(
            int workspaceId,
            DateTime utcNow,
            CancellationToken cancellationToken = default)
        {
            return await _context.Tasks
                .AsNoTracking()
                .Where(t => t.WorkspaceId == workspaceId
                            && t.Status != TaskItemStatus.Done
                            && (t.Status == TaskItemStatus.Overdue || t.DueDate < utcNow))
                .OrderBy(t => t.AssigneeId)
                .ThenBy(t => t.DueDate)
                .Select(t => new OverdueTaskAssigneeRowDto
                {
                    AssigneeId = t.AssigneeId,
                    AssigneeName = t.Assignee != null ? t.Assignee.Name : null,
                    TaskId = t.Id,
                    Title = t.Title,
                    DueDate = t.DueDate
                })
                .ToListAsync(cancellationToken);
        }

        public async Task<AverageCompletionTimeDto> GetAverageCompletionTimeStatsAsync(
            int workspaceId,
            CancellationToken cancellationToken = default)
        {
            var completedQuery = _context.Tasks
                .AsNoTracking()
                .Where(t => t.WorkspaceId == workspaceId
                            && t.Status == TaskItemStatus.Done
                            && t.CompletedAt.HasValue);

            var sampleSize = await completedQuery.CountAsync(cancellationToken);
            if (sampleSize == 0)
            {
                return new AverageCompletionTimeDto
                {
                    AverageDays = 0,
                    AverageHours = 0,
                    SampleSize = 0
                };
            }

            var averageHours = _context.Database.IsSqlite()
                ? await QueryAverageCompletionHoursSqliteAsync(workspaceId, cancellationToken)
                : await QueryAverageCompletionHoursInMemoryAsync(completedQuery, cancellationToken);

            return new AverageCompletionTimeDto
            {
                AverageDays = Math.Round(averageHours / 24d, 2),
                AverageHours = Math.Round(averageHours, 2),
                SampleSize = sampleSize
            };
        }

        public async Task<PaginatedResult<TaskItem>> GetPaginatedAsync(
            int workspaceId,
            TaskQueryDto query)
        {
            var dbQuery = _context.Tasks
                .AsNoTracking()
                .Include(t => t.Assignee)
                .Include(t => t.TaskTags)
                    .ThenInclude(tt => tt.Tag)
                .Where(t => t.WorkspaceId == workspaceId);

            // Search
            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var search = query.Search.ToLower().Trim();
                dbQuery = dbQuery.Where(t =>
                    t.Title.ToLower().Contains(search) ||
                    (t.Description != null && t.Description.ToLower().Contains(search)));
            }

            // Filters
            if (query.Status.HasValue)
                dbQuery = dbQuery.Where(t => t.Status == query.Status.Value);

            if (query.AssigneeId.HasValue)
                dbQuery = dbQuery.Where(t => t.AssigneeId == query.AssigneeId.Value);

            if (query.Priority.HasValue)
                dbQuery = dbQuery.Where(t => t.Priority == query.Priority.Value);

            if (query.DueDateFrom.HasValue)
                dbQuery = dbQuery.Where(t => t.DueDate >= query.DueDateFrom.Value);

            if (query.DueDateTo.HasValue)
                dbQuery = dbQuery.Where(t => t.DueDate <= query.DueDateTo.Value);

            if (query.TagIds != null && query.TagIds.Any())
            {
                dbQuery = dbQuery.Where(t => t.TaskTags.Any(tt => query.TagIds.Contains(tt.TagId)));
            }

            // Sorting
            if (!string.IsNullOrWhiteSpace(query.SortBy))
            {
                var sortBy = query.SortBy.ToLower();
                var isDesc = query.SortOrder?.ToLower() == "desc";

                if (sortBy == "title")
                {
                    dbQuery = isDesc
                        ? dbQuery.OrderByDescending(t => t.Title)
                        : dbQuery.OrderBy(t => t.Title);
                }
                else if (sortBy == "duedate")
                {
                    dbQuery = isDesc
                        ? dbQuery.OrderByDescending(t => t.DueDate)
                        : dbQuery.OrderBy(t => t.DueDate);
                }
                else if (sortBy == "priority")
                {
                    dbQuery = isDesc
                        ? dbQuery.OrderByDescending(t => t.Priority)
                        : dbQuery.OrderBy(t => t.Priority);
                }
                else if (sortBy == "status")
                {
                    dbQuery = isDesc
                        ? dbQuery.OrderByDescending(t => t.Status)
                        : dbQuery.OrderBy(t => t.Status);
                }
                else if (sortBy == "createdat")
                {
                    dbQuery = isDesc
                        ? dbQuery.OrderByDescending(t => t.CreatedAt)
                        : dbQuery.OrderBy(t => t.CreatedAt);
                }
                else if (sortBy == "assignee")
                {
                    dbQuery = isDesc
                        ? dbQuery.OrderByDescending(t => t.Assignee != null ? t.Assignee.Name : "")
                        : dbQuery.OrderBy(t => t.Assignee != null ? t.Assignee.Name : "");
                }
                else
                {
                    dbQuery = dbQuery.OrderBy(t => t.Id);
                }
            }
            else
            {
                dbQuery = dbQuery.OrderBy(t => t.Id);
            }

            // Pagination
            var totalCount = await dbQuery.CountAsync();

            var items = await dbQuery
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize)
                .ToListAsync();

            return new PaginatedResult<TaskItem>
            {
                Items = items,
                TotalCount = totalCount,
                Page = query.Page,
                PageSize = query.PageSize
            };
        }

        private async Task<double> QueryAverageCompletionHoursInMemoryAsync(
            IQueryable<TaskItem> completedQuery,
            CancellationToken cancellationToken)
        {
            var durations = await completedQuery
                .Select(t => new
                {
                    t.CreatedAt,
                    CompletedAt = t.CompletedAt!.Value
                })
                .ToListAsync(cancellationToken);

            if (durations.Count == 0)
            {
                return 0;
            }

            return durations.Average(t => (t.CompletedAt - t.CreatedAt).TotalHours);
        }

        private async Task<double> QueryAverageCompletionHoursSqliteAsync(
            int workspaceId,
            CancellationToken cancellationToken)
        {
            var connection = _context.Database.GetDbConnection();
            var shouldClose = connection.State != ConnectionState.Open;
            if (shouldClose)
            {
                await connection.OpenAsync(cancellationToken);
            }

            try
            {
                await using var command = connection.CreateCommand();
                command.CommandText = @"
SELECT AVG((julianday(""CompletedAt"") - julianday(""CreatedAt"")) * 24.0)
FROM ""Tasks""
WHERE ""WorkspaceId"" = @workspaceId
  AND ""Status"" = @doneStatus
  AND ""CompletedAt"" IS NOT NULL;";

                var workspaceIdParam = command.CreateParameter();
                workspaceIdParam.ParameterName = "@workspaceId";
                workspaceIdParam.Value = workspaceId;
                command.Parameters.Add(workspaceIdParam);

                var statusParam = command.CreateParameter();
                statusParam.ParameterName = "@doneStatus";
                statusParam.Value = TaskItemStatus.Done.ToString();
                command.Parameters.Add(statusParam);

                var scalar = await command.ExecuteScalarAsync(cancellationToken);
                if (scalar == null || scalar is DBNull)
                {
                    return 0;
                }

                return Convert.ToDouble(scalar, CultureInfo.InvariantCulture);
            }
            finally
            {
                if (shouldClose)
                {
                    await connection.CloseAsync();
                }
            }
        }
    }
}
