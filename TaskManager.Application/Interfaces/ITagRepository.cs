using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface ITagRepository
    {
        Task<List<Tag>> GetAllAsync(int workspaceId, string? query = null);
        Task<Tag?> GetByIdAsync(int workspaceId, int id);
        Task<Tag?> GetByNameAsync(int workspaceId, string name);
        Task<Tag> AddAsync(Tag tag);
        Task<int> CountExistingAsync(int workspaceId, IEnumerable<int> tagIds);
    }
}
