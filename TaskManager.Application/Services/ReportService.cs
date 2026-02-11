using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Services
{
    public class ReportService : IReportService
    {
        private readonly ITaskRepository _taskRepository;
        private readonly IOverdueStatusService _overdueStatusService;

        public ReportService(ITaskRepository taskRepository, IOverdueStatusService overdueStatusService)
        {
            _taskRepository = taskRepository;
            _overdueStatusService = overdueStatusService;
        }

        public async Task<StatusSummaryDto> GetStatusSummaryAsync()
        {
            await _overdueStatusService.SyncOverdueStatusesAsync();
            var tasks = (await _taskRepository.GetAllAsync()).ToList();

            return new StatusSummaryDto
            {
                New = tasks.Count(t => t.Status == TaskItemStatus.New),
                InProgress = tasks.Count(t => t.Status == TaskItemStatus.InProgress),
                Done = tasks.Count(t => t.Status == TaskItemStatus.Done),
                Overdue = tasks.Count(t => t.Status == TaskItemStatus.Overdue),
                Total = tasks.Count
            };
        }

        public async Task<IEnumerable<OverdueByAssigneeDto>> GetOverdueTasksByAssigneeAsync()
        {
            await _overdueStatusService.SyncOverdueStatusesAsync();
            var overdueTasks = (await _taskRepository.GetAllAsync(status: TaskItemStatus.Overdue)).ToList();

            var result = overdueTasks
                .GroupBy(t => new
                {
                    AssigneeId = t.AssigneeId,
                    AssigneeName = t.Assignee?.Name
                })
                .Select(g => new OverdueByAssigneeDto
                {
                    AssigneeId = g.Key.AssigneeId ?? 0,
                    AssigneeName = g.Key.AssigneeName ?? "Не назначен",
                    OverdueCount = g.Count(),
                    Tasks = g.Select(t => new OverdueTaskDto
                    {
                        TaskId = t.Id,
                        Title = t.Title,
                        DueDate = t.DueDate,
                        DaysOverdue = Math.Max(0, (int)(DateTime.UtcNow - t.DueDate).TotalDays)
                    }).ToList()
                })
                .ToList();

            return result;
        }

        public async Task<AverageCompletionTimeDto> GetAverageCompletionTimeAsync()
        {
            await _overdueStatusService.SyncOverdueStatusesAsync();
            var completedTasks = (await _taskRepository.GetAllAsync(status: TaskItemStatus.Done))
                .Where(t => t.CompletedAt.HasValue)
                .ToList();

            if (!completedTasks.Any())
            {
                return new AverageCompletionTimeDto
                {
                    AverageDays = 0,
                    AverageHours = 0,
                    SampleSize = 0
                };
            }

            var averageCompletionHours = completedTasks
                .Select(t => (t.CompletedAt!.Value - t.CreatedAt).TotalHours)
                .Average();

            return new AverageCompletionTimeDto
            {
                AverageDays = Math.Round(averageCompletionHours / 24, 2),
                AverageHours = Math.Round(averageCompletionHours, 2),
                    SampleSize = completedTasks.Count
            };
        }
    }
}
