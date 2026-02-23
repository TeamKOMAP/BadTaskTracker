using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class WorkspaceRepository : IWorkspaceRepository
    {
        private readonly ApplicationDbContext _context;

        public WorkspaceRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public Task<List<Workspace>> GetByUserAsync(int userId)
        {
            return _context.Workspaces
                .Include(w => w.CreatedByUser)
                .Include(w => w.Members)
                .ThenInclude(m => m.User)
                .Where(w => w.Members.Any(m => m.UserId == userId))
                .OrderBy(w => w.Name)
                .ToListAsync();
        }

        public Task<Workspace?> GetByIdAsync(int workspaceId)
        {
            return _context.Workspaces
                .Include(w => w.CreatedByUser)
                .Include(w => w.Members)
                .ThenInclude(m => m.User)
                .FirstOrDefaultAsync(w => w.Id == workspaceId);
        }

        public async Task<Workspace> AddAsync(Workspace workspace)
        {
            _context.Workspaces.Add(workspace);
            await _context.SaveChangesAsync();
            return workspace;
        }

        public async Task UpdateAsync(Workspace workspace)
        {
            _context.Workspaces.Update(workspace);
            await _context.SaveChangesAsync();
        }

        public async Task DeleteAsync(Workspace workspace)
        {
            _context.Workspaces.Remove(workspace);
            await _context.SaveChangesAsync();
        }
    }
}
