using Microsoft.EntityFrameworkCore;
using TaskManager.Infrastructure.Data;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Tests.Helpers;

public static class DbHelper
{
    public static async Task ResetDatabaseAsync(ApplicationDbContext db)
    {
        await db.Database.EnsureDeletedAsync();
        await db.Database.EnsureCreatedAsync();
    }

    public static async Task ClearAllDataAsync(ApplicationDbContext db)
    {
        db.TaskTags.RemoveRange(await db.TaskTags.ToListAsync());
        db.Tasks.RemoveRange(await db.Tasks.ToListAsync());
        db.Users.RemoveRange(await db.Users.ToListAsync());
        db.Tags.RemoveRange(await db.Tags.ToListAsync());
        await db.SaveChangesAsync();
    }

    public static async Task<int> SeedTestUserAsync(ApplicationDbContext db)
    {
        var user = new User
        {
            Name = "Тестовый Пользователь",
            Email = "test@example.com",
            CreatedAt = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    public static async Task<List<int>> SeedTestTagsAsync(ApplicationDbContext db)
    {
        var tags = new List<Tag>
        {
            new() { Name = "bug", CreatedAt = DateTime.UtcNow },
            new() { Name = "feature", CreatedAt = DateTime.UtcNow },
            new() { Name = "refactor", CreatedAt = DateTime.UtcNow }
        };

        db.Tags.AddRange(tags);
        await db.SaveChangesAsync();
        return tags.Select(t => t.Id).ToList();
    }

    public static async Task<int> SeedTestTaskAsync(ApplicationDbContext db, int assigneeId)
    {
        var task = new TaskItem
        {
            Title = "Тестовая задача",
            Description = "Создано DbHelper",
            AssigneeId = assigneeId,
            DueDate = DateTime.UtcNow.AddDays(7),
            Status = TaskItemStatus.New,
            Priority = TaskPriority.Medium,
            CreatedAt = DateTime.UtcNow
        };

        db.Tasks.Add(task);
        await db.SaveChangesAsync();
        return task.Id;
    }
}