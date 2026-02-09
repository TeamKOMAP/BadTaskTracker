using Microsoft.EntityFrameworkCore;
using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Application.Services
{
    public class ReportService : IReportService
    {
        private readonly ApplicationDbContext _context;

        public ReportService(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<StatusSummaryDto> GetStatusSummaryAsync()
        {
            // Автоматически обновляем статусы Overdue
            await UpdateOverdueStatuses();

            var tasks = await _context.Tasks.ToListAsync();

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
            // Автоматически обновляем статусы Overdue
            await UpdateOverdueStatuses();

            var overdueTasks = await _context.Tasks
                .Include(t => t.Assignee)
                .Where(t => t.Status == TaskItemStatus.Overdue)
                .ToListAsync();

            var result = overdueTasks
                .GroupBy(t => t.Assignee)
                .Select(g => new OverdueByAssigneeDto
                {
                    AssigneeId = g.Key?.Id ?? 0,
                    AssigneeName = g.Key?.Name ?? "Не назначен",
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
            var completedTasks = await _context.Tasks
                .Where(t => t.Status == TaskItemStatus.Done && t.CompletedAt.HasValue)
                .ToListAsync();

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

        private async Task UpdateOverdueStatuses()
        {
           
            var tasksToUpdate = await _context.Tasks
                .Where(t => t.Status != TaskItemStatus.Done &&
                           t.DueDate < DateTime.UtcNow &&
                           t.Status != TaskItemStatus.Overdue)
                .ToListAsync();

            foreach (var task in tasksToUpdate)
            {
                task.Status = TaskItemStatus.Overdue;
            }

            if (tasksToUpdate.Any())
            {
                await _context.SaveChangesAsync();
            }
        }
    }
}