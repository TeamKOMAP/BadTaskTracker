using Microsoft.EntityFrameworkCore;
using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.Services
{
    public class DashboardService : IDashboardService
    {
        private readonly ITaskRepository _taskRepository;
        private readonly IUserRepository _userRepository;

        public DashboardService(ITaskRepository taskRepository, IUserRepository userRepository)
        {
            _taskRepository = taskRepository;
            _userRepository = userRepository;
        }

        public async Task<DashboardDto> GetDashboardAsync(int workspaceId)
        {
            var now = DateTime.UtcNow;
            var today = now.Date;
            var tomorrow = today.AddDays(1);
            var weekLater = today.AddDays(7);
            var monthAgo = now.AddDays(-30);

            var tasks = (await _taskRepository.GetAllAsync(workspaceId)).ToList();

            var completedTasks = tasks.Count(t => t.Status == TaskItemStatus.Done);
            var totalTasks = tasks.Count;

            var dashboard = new DashboardDto
            {
                TotalTasks = totalTasks,
                CompletedTasks = completedTasks,
                InProgressTasks = tasks.Count(t => t.Status == TaskItemStatus.InProgress),
                OverdueTasks = tasks.Count(t => t.Status != TaskItemStatus.Done && t.DueDate < now),
                TasksDueToday = tasks.Count(t => t.DueDate.Date == today && t.Status != TaskItemStatus.Done),
                TasksDueTomorrow = tasks.Count(t => t.DueDate.Date == tomorrow && t.Status != TaskItemStatus.Done),
                TasksDueThisWeek = tasks.Count(t =>
                    t.DueDate.Date >= today &&
                    t.DueDate.Date <= weekLater &&
                    t.Status != TaskItemStatus.Done),

                CompletionRate = totalTasks > 0
                    ? Math.Round((double)completedTasks / totalTasks * 100, 1)
                    : 0,

                OnTimeRate = completedTasks > 0
                    ? Math.Round((double)tasks.Count(t =>
                        t.Status == TaskItemStatus.Done &&
                        t.CompletedAt <= t.DueDate) / completedTasks * 100, 1)
                    : 0,

                TasksByStatus = tasks
                    .GroupBy(t => t.Status.ToString())
                    .ToDictionary(g => g.Key, g => g.Count()),

                TasksByPriority = tasks
                    .GroupBy(t => t.Priority.ToString())
                    .ToDictionary(g => g.Key, g => g.Count()),

                TasksByDay = tasks
                    .Where(t => t.CreatedAt >= monthAgo)
                    .GroupBy(t => t.CreatedAt.Date.ToString("dd.MM"))
                    .OrderBy(g => g.Key)
                    .ToDictionary(g => g.Key, g => g.Count()),

                TasksByAssignee = tasks
                    .Where(t => t.Assignee != null)
                    .GroupBy(t => t.Assignee!.Name ?? "Без исполнителя")
                    .ToDictionary(g => g.Key, g => g.Count()),

                TopPerformers = tasks
                    .Where(t => t.Status == TaskItemStatus.Done
                        && t.CompletedAt >= monthAgo
                        && t.Assignee != null)
                    .GroupBy(t => new { t.Assignee!.Id, t.Assignee.Name })
                    .Select(g => new UserTaskCountDto
                    {
                        UserId = g.Key.Id,
                        UserName = g.Key.Name ?? "Unknown",
                        CompletedCount = g.Count()
                    })
                    .OrderByDescending(u => u.CompletedCount)
                    .Take(5)
                    .ToList()
            };

            dashboard.RecentActivities = new List<RecentActivityDto>();
            return dashboard;
        }
    }
}