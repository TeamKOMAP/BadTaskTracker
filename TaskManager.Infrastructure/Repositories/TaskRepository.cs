using Microsoft.EntityFrameworkCore;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Infrastructure.Repositories
{
    public class TaskRepository : ITaskRepository
    {
        private readonly ApplicationDbContext _context;

        public TaskRepository(ApplicationDbContext context)
        {
            _context = context;
        }

        public async System.Threading.Tasks.Task<System.Collections.Generic.IEnumerable<TaskItem>> GetAllAsync(
            TaskItemStatus? status = null,
            int? assigneeId = null,
            System.DateTime? dueBefore = null,
            System.DateTime? dueAfter = null,
            System.Collections.Generic.List<int>? tagIds = null)
        {
            var query = _context.Tasks
                .Include(t => t.Assignee)
                .Include(t => t.TaskTags)
                    .ThenInclude(tt => tt.Tag)
                .AsQueryable();

            if (status.HasValue)
                query = query.Where(t => t.Status == status.Value);

            if (assigneeId.HasValue)
                query = query.Where(t => t.AssigneeId == assigneeId.Value);

            if (dueBefore.HasValue)
                query = query.Where(t => t.DueDate <= dueBefore.Value);

            if (dueAfter.HasValue)
                query = query.Where(t => t.DueDate >= dueAfter.Value);

            if (tagIds != null && tagIds.Any())
            {
                query = query.Where(t => t.TaskTags.Any(tt => tagIds.Contains(tt.TagId)));
            }

            return await query.ToListAsync();
        }

        public async System.Threading.Tasks.Task<TaskItem?> GetByIdAsync(int id)
        {
            return await _context.Tasks
                .Include(t => t.Assignee)
                .Include(t => t.TaskTags)
                    .ThenInclude(tt => tt.Tag)
                .FirstOrDefaultAsync(t => t.Id == id);
        }

        public async System.Threading.Tasks.Task<TaskItem> AddAsync(TaskItem taskItem)
        {
            _context.Tasks.Add(taskItem);
            await _context.SaveChangesAsync();
            return taskItem;
        }

        public async System.Threading.Tasks.Task UpdateAsync(TaskItem taskItem)
        {
            _context.Entry(taskItem).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }

        public async System.Threading.Tasks.Task DeleteAsync(TaskItem taskItem)
        {
            _context.Tasks.Remove(taskItem);
            await _context.SaveChangesAsync();
        }

        public async System.Threading.Tasks.Task<bool> ExistsAsync(int id)
        {
            return await _context.Tasks.AnyAsync(t => t.Id == id);
        }
    }
}