using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using TaskManager.Infrastructure.Storage;
using Xunit;

namespace TaskManager.Tests.IntegrationTests;

public class TestBase : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string JwtIssuer = "GoodTaskTracker";
    private const string JwtAudience = "GoodTaskTracker.Client";
    private const string JwtSigningKey = "BTT_JWT_5c2a9d1f7e4b8a6c3d0f2e1a9b7c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b";

    protected readonly HttpClient _client;
    protected readonly WebApplicationFactory<Program> _factory;
    protected readonly string AttachmentStorageRootPath;
    protected int TestWorkspaceId { get; private set; }
    protected int TestUserId { get; private set; }

    public TestBase(WebApplicationFactory<Program> factory)
    {
        var dbName = $"TestDb_{Guid.NewGuid()}";
        AttachmentStorageRootPath = Path.Combine(Path.GetTempPath(), "BadTaskTracker.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(AttachmentStorageRootPath);
        
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(
                    d => d.ServiceType == typeof(DbContextOptions<ApplicationDbContext>));

                if (descriptor != null)
                    services.Remove(descriptor);

                services.RemoveAll<IAttachmentStorage>();
                services.AddDbContext<ApplicationDbContext>(options =>
                {
                    options.UseInMemoryDatabase(dbName);
                });

                services.AddSingleton<IAttachmentStorage>(sp =>
                {
                    var logger = sp.GetRequiredService<ILogger<FileAttachmentStorage>>();
                    return new FileAttachmentStorage(AttachmentStorageRootPath, logger);
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

        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", CreateAccessToken(TestUserId, TestWorkspaceId));
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(AttachmentStorageRootPath))
            {
                Directory.Delete(AttachmentStorageRootPath, true);
            }
        }
        catch
        {
            // игнорировать очистку по мере возможности
        }
    }
    protected string CreateAccessToken(int userId, int? workspaceId = null)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(ClaimTypes.NameIdentifier, userId.ToString()),
            new(ClaimTypes.Name, "Test User"),
            new(ClaimTypes.Email, "test@example.com"),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };

        if (workspaceId.HasValue && workspaceId.Value > 0)
        {
            claims.Add(new Claim("workspace_id", workspaceId.Value.ToString()));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtSigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: JwtIssuer,
            audience: JwtAudience,
            claims: claims,
            notBefore: now,
            expires: now.AddHours(1),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    protected HttpClient CreateAuthorizedClient(int? workspaceId = null, int? userId = null)
    {
        var client = _factory.CreateClient();
        var actorUserId = userId ?? TestUserId;
        var actorWorkspaceId = workspaceId;
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", CreateAccessToken(actorUserId, actorWorkspaceId));
        return client;
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
