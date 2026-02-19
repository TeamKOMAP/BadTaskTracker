using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface IUserRepository
    {
        Task<List<User>> GetAllAsync(string? query = null);
        Task<User?> GetByIdAsync(int id);
        Task<User?> GetByEmailAsync(string email);
        Task<bool> ExistsAsync(int id);
        Task<bool> EmailExistsAsync(string email);
        Task<User> AddAsync(User user);
        Task UpdateAsync(User user, CancellationToken cancellationToken = default);
        Task<int> GetTaskCountAsync(int userId);
        Task<Dictionary<int, int>> GetTaskCountsAsync(IEnumerable<int> userIds);
    }
}
