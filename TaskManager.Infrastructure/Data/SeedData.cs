using Microsoft.EntityFrameworkCore;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;

namespace TaskManager.Infrastructure.Data
{
    public static class SeedData
    {
        public static void Initialize(ApplicationDbContext context)
        {
            // Если уже есть данные - выходим
            if (context.Users.Any() || context.Tasks.Any())
            {
                return;
            }

            Console.WriteLine("Seeding database...");

            // 1. Пользователи
            var users = new List<User>
            {
                new User { Name = "Иван Петров", Email = "ivan@example.com" },
                new User { Name = "Мария Сидорова", Email = "maria@example.com" },
                new User { Name = "Алексей Иванов", Email = "alex@example.com" },
                new User { Name = "Елена Смирнова", Email = "elena@example.com" },
                new User { Name = "Дмитрий Козлов", Email = "dmitry@example.com" }
            };
            context.Users.AddRange(users);
            context.SaveChanges();

            Console.WriteLine($"Created {users.Count} users");

            // 2. Теги
            var tags = new List<Tag>
            {
                new Tag { Name = "Срочно" },
                new Tag { Name = "Важно" },
                new Tag { Name = "Документация" },
                new Tag { Name = "Разработка" },
                new Tag { Name = "Тестирование" },
                new Tag { Name = "Дизайн" },
                new Tag { Name = "Баги" },
                new Tag { Name = "Улучшение" }
            };
            context.Tags.AddRange(tags);
            context.SaveChanges();

            Console.WriteLine($"Created {tags.Count} tags");

            // 3. Задачи
            var tasks = new List<TaskItem>
            {
                new TaskItem
                {
                    Title = "Настроить Swagger документацию",
                    Description = "Добавить XML комментарии к API",
                    AssigneeId = users[0].Id,
                    DueDate = DateTime.UtcNow.AddDays(3),
                    Status = TaskItemStatus.InProgress,
                    Priority = TaskPriority.High,
                    CreatedAt = DateTime.UtcNow.AddDays(-5)
                },
                new TaskItem
                {
                    Title = "Написать unit-тесты для сервисов",
                    Description = "Покрыть тестами TaskService и UserService",
                    AssigneeId = users[1].Id,
                    DueDate = DateTime.UtcNow.AddDays(7),
                    Status = TaskItemStatus.New,
                    Priority = TaskPriority.Medium,
                    CreatedAt = DateTime.UtcNow.AddDays(-3)
                },
                new TaskItem
                {
                    Title = "Исправить баг с фильтрацией задач",
                    Description = "При фильтрации по тегам не работает сортировка",
                    AssigneeId = users[2].Id,
                    DueDate = DateTime.UtcNow.AddDays(1),
                    Status = TaskItemStatus.InProgress,
                    Priority = TaskPriority.High,
                    CreatedAt = DateTime.UtcNow.AddDays(-2)
                },
                new TaskItem
                {
                    Title = "Добавить пагинацию в API",
                    Description = "Реализовать пагинацию для GET /api/Tasks",
                    AssigneeId = users[3].Id,
                    DueDate = DateTime.UtcNow.AddDays(10),
                    Status = TaskItemStatus.New,
                    Priority = TaskPriority.Medium,
                    CreatedAt = DateTime.UtcNow.AddDays(-1)
                },
                new TaskItem
                {
                    Title = "Обновить README.md",
                    Description = "Добавить инструкцию по запуску проекта",
                    AssigneeId = users[4].Id,
                    DueDate = DateTime.UtcNow.AddDays(-2), // Просрочена
                    Status = TaskItemStatus.Overdue,
                    Priority = TaskPriority.Low,
                    CreatedAt = DateTime.UtcNow.AddDays(-7)
                },
                new TaskItem
                {
                    Title = "Рефакторинг кода",
                    Description = "Улучшить архитектуру репозиториев",
                    AssigneeId = users[0].Id,
                    DueDate = DateTime.UtcNow.AddDays(-5),
                    Status = TaskItemStatus.Done,
                    Priority = TaskPriority.Medium,
                    CreatedAt = DateTime.UtcNow.AddDays(-10),
                    CompletedAt = DateTime.UtcNow.AddDays(-3)
                },
                new TaskItem
                {
                    Title = "Добавить авторизацию JWT",
                    Description = "Реализовать систему аутентификации",
                    AssigneeId = users[1].Id,
                    DueDate = DateTime.UtcNow.AddDays(14),
                    Status = TaskItemStatus.New,
                    Priority = TaskPriority.High,
                    CreatedAt = DateTime.UtcNow.AddDays(-4)
                },
                new TaskItem
                {
                    Title = "Настроить логирование",
                    Description = "Добавить Serilog с записью в файл",
                    AssigneeId = users[2].Id,
                    DueDate = DateTime.UtcNow.AddDays(5),
                    Status = TaskItemStatus.InProgress,
                    Priority = TaskPriority.Medium,
                    CreatedAt = DateTime.UtcNow.AddDays(-6)
                }
            };
            context.Tasks.AddRange(tasks);
            context.SaveChanges();

            Console.WriteLine($"Created {tasks.Count} tasks");

            // 4. Связи задач с тегами (many-to-many)
            var random = new Random();
            var taskTags = new List<TaskTag>();

            foreach (var task in tasks)
            {
                // Каждая задача получает 1-3 случайных тега
                var taskTagCount = random.Next(1, 4);
                var selectedTags = tags.OrderBy(x => random.Next()).Take(taskTagCount);

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

            Console.WriteLine($"Created {taskTags.Count} task-tag relationships");
            Console.WriteLine("Database seeded successfully!");
        }
    }
}