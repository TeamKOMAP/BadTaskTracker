using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface IReportService
    {
        Task<StatusSummaryDto> GetStatusSummaryAsync(int workspaceId, int actorUserId);
        Task<IEnumerable<OverdueByAssigneeDto>> GetOverdueTasksByAssigneeAsync(int workspaceId, int actorUserId);
        Task<AverageCompletionTimeDto> GetAverageCompletionTimeAsync(int workspaceId, int actorUserId);
    }
}
