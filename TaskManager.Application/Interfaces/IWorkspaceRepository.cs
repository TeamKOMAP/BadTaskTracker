using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface IWorkspaceRepository
    {
        Task<List<Workspace>> GetByUserAsync(int userId);
        Task<Workspace?> GetByIdAsync(int workspaceId);
        Task<Workspace> AddAsync(Workspace workspace);
        Task UpdateAsync(Workspace workspace);
    }
}
