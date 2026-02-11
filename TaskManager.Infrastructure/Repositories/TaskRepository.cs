using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
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

        public async Task<IEnumerable<TaskItem>> GetAllAsync(
            TaskItemStatus? status = null,
            int? assigneeId = null,
            DateTime? dueBefore = null,
            DateTime? dueAfter = null,
            List<int>? tagIds = null)
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

        public async Task<TaskItem?> GetByIdAsync(int id)
        {
            return await _context.Tasks
                .Include(t => t.Assignee)
                .Include(t => t.TaskTags)
                    .ThenInclude(tt => tt.Tag)
                .FirstOrDefaultAsync(t => t.Id == id);
        }

        public async Task<TaskItem> AddAsync(TaskItem taskItem)
        {
            _context.Tasks.Add(taskItem);
            await _context.SaveChangesAsync();
            return taskItem;
        }

        public async Task UpdateAsync(TaskItem taskItem)
        {
            _context.Entry(taskItem).State = EntityState.Modified;
            await _context.SaveChangesAsync();
        }

        public async Task DeleteAsync(TaskItem taskItem)
        {
            _context.Tasks.Remove(taskItem);
            await _context.SaveChangesAsync();
        }

        public async Task<bool> ExistsAsync(int id)
        {
            return await _context.Tasks.AnyAsync(t => t.Id == id);
        }

        public async Task<int> UpdateOverdueStatusesAsync(DateTime utcNow)
        {
            var tasksToUpdate = await _context.Tasks
                .Where(t => t.Status != TaskItemStatus.Done &&
                            t.DueDate < utcNow &&
                            t.Status != TaskItemStatus.Overdue)
                .ToListAsync();

            if (tasksToUpdate.Count == 0)
            {
                return 0;
            }

            foreach (var task in tasksToUpdate)
            {
                task.Status = TaskItemStatus.Overdue;
                task.UpdatedAt = utcNow;
            }

            await _context.SaveChangesAsync();
            return tasksToUpdate.Count;
        }
    }
}
