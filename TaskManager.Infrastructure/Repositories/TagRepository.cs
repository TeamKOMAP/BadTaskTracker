using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class TagRepository : ITagRepository
    {
        private readonly ApplicationDbContext _context;

        public TagRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<List<Tag>> GetAllAsync(int workspaceId, string? query = null)
        {
            var tags = _context.Tags
                .AsNoTracking()
                .Where(t => t.WorkspaceId == workspaceId);

            if (!string.IsNullOrWhiteSpace(query))
            {
                var needle = query.Trim().ToLower();
                tags = tags.Where(t => t.Name.ToLower().Contains(needle) || t.Id.ToString() == needle);
            }

            return await tags
                .OrderBy(t => t.Name)
                .ToListAsync();
        }

        public Task<Tag?> GetByIdAsync(int workspaceId, int id)
        {
            return _context.Tags
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == id && t.WorkspaceId == workspaceId);
        }

        public Task<Tag?> GetByNameAsync(int workspaceId, string name)
        {
            var normalizedName = name.Trim().ToLower();
            return _context.Tags
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.WorkspaceId == workspaceId && t.Name.ToLower() == normalizedName);
        }

        public async Task<Tag> AddAsync(Tag tag)
        {
            _context.Tags.Add(tag);
            await _context.SaveChangesAsync();
            return tag;
        }

        public Task<int> CountExistingAsync(int workspaceId, IEnumerable<int> tagIds)
        {
            var ids = tagIds.Distinct().ToList();
            if (ids.Count == 0)
            {
                return Task.FromResult(0);
            }

            return _context.Tags
                .AsNoTracking()
                .CountAsync(t => t.WorkspaceId == workspaceId && ids.Contains(t.Id));
        }
    }
}
