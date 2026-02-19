using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;

namespace TaskManager.Application.Services
{
    public class ReportService : IReportService
    {
        private readonly ITaskRepository _taskRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;

        public ReportService(
            ITaskRepository taskRepository,
            IWorkspaceMemberRepository workspaceMemberRepository)
        {
            _taskRepository = taskRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
        }

        public async Task<StatusSummaryDto> GetStatusSummaryAsync(int workspaceId, int actorUserId)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            return await _taskRepository.GetStatusSummaryAsync(workspaceId, DateTime.UtcNow);
        }

        public async Task<IEnumerable<OverdueByAssigneeDto>> GetOverdueTasksByAssigneeAsync(int workspaceId, int actorUserId)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            var now = DateTime.UtcNow;
            var overdueTasks = await _taskRepository.GetOverdueTaskRowsAsync(workspaceId, now);

            var result = overdueTasks
                .GroupBy(t => new
                {
                    AssigneeId = t.AssigneeId,
                    t.AssigneeName
                })
                .Select(g => new OverdueByAssigneeDto
                {
                    AssigneeId = g.Key.AssigneeId ?? 0,
                    AssigneeName = g.Key.AssigneeName ?? "Не назначен",
                    OverdueCount = g.Count(),
                    Tasks = g.Select(t => new OverdueTaskDto
                    {
                        TaskId = t.TaskId,
                        Title = t.Title,
                        DueDate = AsUtc(t.DueDate),
                        DaysOverdue = Math.Max(0, (int)(now - t.DueDate).TotalDays)
                    }).ToList()
                })
                .ToList();

            return result;
        }

        public async Task<AverageCompletionTimeDto> GetAverageCompletionTimeAsync(int workspaceId, int actorUserId)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            return await _taskRepository.GetAverageCompletionTimeStatsAsync(workspaceId);
        }

        private async Task EnsureMemberAsync(int workspaceId, int actorUserId)
        {
            var isMember = await _workspaceMemberRepository.IsMemberAsync(workspaceId, actorUserId);
            if (!isMember)
            {
                throw new TaskManager.Application.Exceptions.ForbiddenException("You are not a member of this workspace");
            }
        }

        private static DateTime AsUtc(DateTime value)
        {
            return value.Kind == DateTimeKind.Utc
                ? value
                : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        }
    }
}
