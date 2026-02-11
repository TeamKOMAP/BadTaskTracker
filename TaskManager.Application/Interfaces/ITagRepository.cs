using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface ITagRepository
    {
        Task<List<Tag>> GetAllAsync(string? query = null);
        Task<Tag?> GetByIdAsync(int id);
        Task<Tag?> GetByNameAsync(string name);
        Task<Tag> AddAsync(Tag tag);
        Task<int> CountExistingAsync(IEnumerable<int> tagIds);
    }
}
