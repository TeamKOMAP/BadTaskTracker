using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface IDashboardService
    {
        Task<DashboardDto> GetDashboardAsync(int workspaceId);
    }
}