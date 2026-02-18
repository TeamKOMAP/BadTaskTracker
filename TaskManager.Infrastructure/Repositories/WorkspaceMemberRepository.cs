using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class WorkspaceMemberRepository : IWorkspaceMemberRepository
    {
        private readonly ApplicationDbContext _context;

        public WorkspaceMemberRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public Task<WorkspaceMember?> GetMemberAsync(int workspaceId, int userId)
        {
            return _context.WorkspaceMembers
                .Include(m => m.User)
                .FirstOrDefaultAsync(m => m.WorkspaceId == workspaceId && m.UserId == userId);
        }

        public Task<List<WorkspaceMember>> GetMembersAsync(int workspaceId)
        {
            return _context.WorkspaceMembers
                .Include(m => m.User)
                .Where(m => m.WorkspaceId == workspaceId)
                .ToListAsync();
        }

        public async Task<WorkspaceMember> AddAsync(WorkspaceMember member)
        {
            _context.WorkspaceMembers.Add(member);
            await _context.SaveChangesAsync();
            return member;
        }

        public async Task UpdateAsync(WorkspaceMember member)
        {
            _context.WorkspaceMembers.Update(member);
            await _context.SaveChangesAsync();
        }

        public async Task RemoveAsync(WorkspaceMember member)
        {
            _context.WorkspaceMembers.Remove(member);
            await _context.SaveChangesAsync();
        }

        public Task<bool> IsMemberAsync(int workspaceId, int userId)
        {
            return _context.WorkspaceMembers
                .AsNoTracking()
                .AnyAsync(m => m.WorkspaceId == workspaceId && m.UserId == userId);
        }
    }
}
