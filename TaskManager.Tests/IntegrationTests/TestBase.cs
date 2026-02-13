using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestPlatform.TestHost;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Tests.IntegrationTests;

public class TestBase : IClassFixture<WebApplicationFactory<Program>>
{
    protected readonly HttpClient _client;
    protected readonly WebApplicationFactory<Program> _factory;
    private readonly string _dbName;

    public TestBase(WebApplicationFactory<Program> factory)
    {
        // Уникальное имя базы данных для каждого теста
        _dbName = Guid.NewGuid().ToString();
        
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<ApplicationDbContext>));

                if (descriptor != null)
                    services.Remove(descriptor);

                var factoryDescriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(IDbContextFactory<ApplicationDbContext>));

                if (factoryDescriptor != null)
                    services.Remove(factoryDescriptor);

                services.AddDbContext<ApplicationDbContext>(options =>
                {
                    options.UseInMemoryDatabase(_dbName);
                });

                var sp = services.BuildServiceProvider();
                using var scope = sp.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

                dbContext.Database.EnsureDeleted();
                dbContext.Database.EnsureCreated();

                SeedTestData(dbContext);
            });
        });

        _client = _factory.CreateClient();
    }

    private void SeedTestData(ApplicationDbContext db)
    {
        if (!db.Users.Any())
        {
            db.Users.AddRange(new List<User>
            {
                new() { Name = "Иван Петров", Email = "ivan@example.com" },
                new() { Name = "Мария Иванова", Email = "maria@example.com" },
                new() { Name = "Петр Сидоров", Email = "petr@example.com" }
            });
            db.SaveChanges();
        }

        if (!db.Tags.Any())
        {
            db.Tags.AddRange(new List<Tag>
            {
                new() { Name = "bug" },
                new() { Name = "feature" },
                new() { Name = "refactor" },
                new() { Name = "docs" }
            });
            db.SaveChanges();
        }

        if (!db.Tasks.Any())
        {
            var user = db.Users.First();
            var tag = db.Tags.First();

            var task = new TaskItem
            {
                Title = "Тестовая задача",
                Description = "Создано автоматически для тестов",
                AssigneeId = user.Id,
                DueDate = DateTime.UtcNow.AddDays(7),
                Status = TaskItemStatus.New,
                Priority = TaskPriority.Medium,
                CreatedAt = DateTime.UtcNow
            };

            db.Tasks.Add(task);
            db.SaveChanges();

            db.TaskTags.Add(new TaskTag { TaskId = task.Id, TagId = tag.Id, CreatedAt = DateTime.UtcNow });
            db.SaveChanges();
        }
    }
}
