using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Infrastructure.Data
{
    public static class SeedData
    {
        public static void Initialize(ApplicationDbContext context)
        {
            if (context.Workspaces.Any() || context.Users.Any() || context.Tasks.Any())
            {
                return;
            }

            Console.WriteLine("Seeding database...");

            var users = new List<User>
            {
                new() { Name = "Ivan Petrov", Email = "ivan@example.com" },
                new() { Name = "Maria Sidorova", Email = "maria@example.com" },
                new() { Name = "Alex Ivanov", Email = "alex@example.com" },
                new() { Name = "Elena Smirnova", Email = "elena@example.com" },
                new() { Name = "Dmitry Kozlov", Email = "dmitry@example.com" }
            };
            context.Users.AddRange(users);
            context.SaveChanges();

            var workspace = new Workspace
            {
                Name = "General",
                CreatedByUserId = users[0].Id,
                CreatedAt = DateTime.UtcNow
            };
            context.Workspaces.Add(workspace);
            context.SaveChanges();

            var members = users.Select((u, i) => new WorkspaceMember
            {
                WorkspaceId = workspace.Id,
                UserId = u.Id,
                Role = i == 0 ? WorkspaceRole.Owner : WorkspaceRole.Member,
                AddedAt = DateTime.UtcNow
            }).ToList();
            context.WorkspaceMembers.AddRange(members);
            context.SaveChanges();

            var tags = new List<Tag>
            {
                new() { Name = "Urgent", WorkspaceId = workspace.Id },
                new() { Name = "Important", WorkspaceId = workspace.Id },
                new() { Name = "Documentation", WorkspaceId = workspace.Id },
                new() { Name = "Development", WorkspaceId = workspace.Id },
                new() { Name = "Testing", WorkspaceId = workspace.Id },
                new() { Name = "Design", WorkspaceId = workspace.Id },
                new() { Name = "Bugs", WorkspaceId = workspace.Id },
                new() { Name = "Improvement", WorkspaceId = workspace.Id }
            };
            context.Tags.AddRange(tags);
            context.SaveChanges();

            var tasks = new List<TaskItem>
            {
                new()
                {
                    WorkspaceId = workspace.Id,
                    Title = "Setup Swagger docs",
                    Description = "Add XML comments for API endpoints",
                    AssigneeId = users[0].Id,
                    DueDate = DateTime.UtcNow.AddDays(3),
                    Status = TaskItemStatus.InProgress,
                    Priority = TaskPriority.High,
                    CreatedAt = DateTime.UtcNow.AddDays(-5)
                },
                new()
                {
                    WorkspaceId = workspace.Id,
                    Title = "Write unit tests",
                    Description = "Cover TaskService and UserService",
                    AssigneeId = users[1].Id,
                    DueDate = DateTime.UtcNow.AddDays(7),
                    Status = TaskItemStatus.New,
                    Priority = TaskPriority.Medium,
                    CreatedAt = DateTime.UtcNow.AddDays(-3)
                },
                new()
                {
                    WorkspaceId = workspace.Id,
                    Title = "Fix filtering bug",
                    Description = "Sort order breaks when filtering by tags",
                    AssigneeId = users[2].Id,
                    DueDate = DateTime.UtcNow.AddDays(1),
                    Status = TaskItemStatus.InProgress,
                    Priority = TaskPriority.High,
                    CreatedAt = DateTime.UtcNow.AddDays(-2)
                },
                new()
                {
                    WorkspaceId = workspace.Id,
                    Title = "Update README",
                    Description = "Add setup and run guide",
                    AssigneeId = users[4].Id,
                    DueDate = DateTime.UtcNow.AddDays(-2),
                    Status = TaskItemStatus.Overdue,
                    Priority = TaskPriority.Low,
                    CreatedAt = DateTime.UtcNow.AddDays(-7)
                }
            };
            context.Tasks.AddRange(tasks);
            context.SaveChanges();

            var random = new Random();
            var taskTags = new List<TaskTag>();

            foreach (var task in tasks)
            {
                var taskTagCount = random.Next(1, 4);
                var selectedTags = tags.OrderBy(_ => random.Next()).Take(taskTagCount);
                foreach (var tag in selectedTags)
                {
                    taskTags.Add(new TaskTag
                    {
                        TaskId = task.Id,
                        TagId = tag.Id
                    });
                }
            }

            context.TaskTags.AddRange(taskTags);
            context.SaveChanges();

            Console.WriteLine("Database seeded successfully.");
        }
    }
}
