using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface IReportService
    {
        Task<StatusSummaryDto> GetStatusSummaryAsync();
        Task<IEnumerable<OverdueByAssigneeDto>> GetOverdueTasksByAssigneeAsync();
        Task<AverageCompletionTimeDto> GetAverageCompletionTimeAsync();
    }
}