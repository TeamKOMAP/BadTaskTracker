using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestPlatform.TestHost;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using Xunit;

namespace TaskManager.Tests.IntegrationTests;

public class TestBase : IClassFixture<WebApplicationFactory<Program>>
{
    protected readonly HttpClient _client;
    protected readonly WebApplicationFactory<Program> _factory;
    protected int TestWorkspaceId { get; private set; }
    protected int TestUserId { get; private set; }

    public TestBase(WebApplicationFactory<Program> factory)
    {
        var dbName = $"TestDb_{Guid.NewGuid()}";
        
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<ApplicationDbContext>));

                if (descriptor != null)
                    services.Remove(descriptor);

                services.AddDbContext<ApplicationDbContext>(options =>
                {
                    options.UseInMemoryDatabase(dbName);
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
        
        // Устанавливаем заголовки по умолчанию
        _client.DefaultRequestHeaders.Add("X-Actor-UserId", TestUserId.ToString());
        _client.DefaultRequestHeaders.Add("X-Workspace-Id", TestWorkspaceId.ToString());
    }

    private void SeedTestData(ApplicationDbContext db)
    {
        if (!db.Users.Any())
        {
            var user = new User
            { 
                Name = "Тестовый Пользователь", 
                Email = "test@example.com" 
            };
            db.Users.Add(user);
            db.SaveChanges();
            TestUserId = user.Id;
        }

        if (!db.Workspaces.Any())
        {
            var workspace = new Workspace
            {
                Name = "Тестовый Workspace",
                CreatedByUserId = TestUserId,
                CreatedAt = DateTime.UtcNow
            };
            db.Workspaces.Add(workspace);
            db.SaveChanges();
            TestWorkspaceId = workspace.Id;
            
            // Добавляем пользователя как члена воркспейса
            db.WorkspaceMembers.Add(new WorkspaceMember
            {
                WorkspaceId = workspace.Id,
                UserId = TestUserId,
                Role = WorkspaceRole.Owner,
                AddedAt = DateTime.UtcNow
            });
            db.SaveChanges();
        }

        if (!db.Tags.Any())
        {
            db.Tags.AddRange(new List<Tag>
            {
                new() { Name = "bug", WorkspaceId = TestWorkspaceId },
                new() { Name = "feature", WorkspaceId = TestWorkspaceId },
                new() { Name = "refactor", WorkspaceId = TestWorkspaceId },
                new() { Name = "docs", WorkspaceId = TestWorkspaceId }
            });
            db.SaveChanges();
        }

        if (!db.Tasks.Any())
        {
            var tag = db.Tags.First();

            var task = new TaskItem
            {
                Title = "Тестовая задача",
                Description = "Создано автоматически для тестов",
                AssigneeId = TestUserId,
                WorkspaceId = TestWorkspaceId,
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
