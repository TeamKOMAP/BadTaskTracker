using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class UserRepository : IUserRepository
    {
        private readonly ApplicationDbContext _context;

        public UserRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<User>> GetAllAsync(string? query = null)
        {
            var users = _context.Users.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(query))
            {
                var needle = query.Trim().ToLower();
                users = users.Where(u =>
                    u.Name.ToLower().Contains(needle) ||
                    u.Email.ToLower().Contains(needle) ||
                    u.Id.ToString() == needle);
            }

            return await users
                .OrderBy(u => u.Name)
                .ToListAsync();
        }

        public Task<User?> GetByIdAsync(int id)
        {
            return _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == id);
        }

        public Task<bool> ExistsAsync(int id)
        {
            return _context.Users
                .AsNoTracking()
                .AnyAsync(u => u.Id == id);
        }

        public Task<bool> EmailExistsAsync(string email)
        {
            var normalizedEmail = email.Trim().ToLower();
            return _context.Users
                .AsNoTracking()
                .AnyAsync(u => u.Email.ToLower() == normalizedEmail);
        }

        public async Task<User> AddAsync(User user)
        {
            _context.Users.Add(user);
            await _context.SaveChangesAsync();
            return user;
        }

        public Task<int> GetTaskCountAsync(int userId)
        {
            return _context.Tasks
                .AsNoTracking()
                .CountAsync(t => t.AssigneeId == userId);
        }

        public async Task<Dictionary<int, int>> GetTaskCountsAsync(IEnumerable<int> userIds)
        {
            var ids = userIds.Distinct().ToList();
            if (ids.Count == 0)
            {
                return new Dictionary<int, int>();
            }

            return await _context.Tasks
                .AsNoTracking()
                .Where(t => t.AssigneeId.HasValue && ids.Contains(t.AssigneeId.Value))
                .GroupBy(t => t.AssigneeId!.Value)
                .Select(g => new { UserId = g.Key, TaskCount = g.Count() })
                .ToDictionaryAsync(x => x.UserId, x => x.TaskCount);
        }
    }
}
