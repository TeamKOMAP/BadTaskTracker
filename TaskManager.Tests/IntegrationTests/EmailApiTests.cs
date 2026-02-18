using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using System.Net;
using System.Net.Http.Json;
using TaskManager.API.Security;
using TaskManager.Application.Auth;
using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    [Trait("Category", "Auth")]
    public class EmailApiTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
    {
        private const string JwtIssuer = "GoodTaskTracker";
        private const string JwtAudience = "GoodTaskTracker.Client";
        private const string JwtSigningKey = "CHANGE_ME_IN_PRODUCTION_WITH_32_PLUS_CHARS";

        private readonly HttpClient _client;
        private readonly WebApplicationFactory<Program> _factory;
        private readonly List<EmailRecord> _sentEmails = new();
        private int _testWorkspaceId;
        private int _testUserId;

        public EmailApiTests(WebApplicationFactory<Program> factory)
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

                    services.RemoveAll<EmailAuthSettings>();
                    services.AddSingleton(new EmailAuthSettings
                    {
                        CodeLength = 6,
                        CodeLifetimeMinutes = 10,
                        ResendCooldownSeconds = 1,
                        MaxAttempts = 5,
                        EnableDevelopmentCodeFallback = true,
                        ExposeDevelopmentCodeInResponse = true
                    });

                    services.RemoveAll<SmtpSettings>();
                    services.AddSingleton(new SmtpSettings());

                    services.RemoveAll<JwtSettings>();
                    services.AddSingleton(new JwtSettings
                    {
                        Issuer = JwtIssuer,
                        Audience = JwtAudience,
                        SigningKey = JwtSigningKey
                    });

                    services.RemoveAll<IEmailSender>();
                    services.AddSingleton<IEmailSender>(new RecordingEmailSender(_sentEmails));

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

        public void Dispose()
        {
            _sentEmails.Clear();
        }

        [Fact]
        public async Task RequestEmailCode_SendsEmailToCorrectAddress()
        {
            var dto = new EmailCodeRequestDto { Email = "send-test@example.com" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            _sentEmails.Should().Contain(e => e.ToEmail == "send-test@example.com");
        }

        [Fact]
        public async Task RequestEmailCode_EmailContainsSubject()
        {
            var dto = new EmailCodeRequestDto { Email = "subject-test@example.com" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var email = _sentEmails.FirstOrDefault(e => e.ToEmail == "subject-test@example.com");
            email.Should().NotBeNull();
            email!.Subject.Should().Contain("sign-in code");
        }

        [Fact]
        public async Task RequestEmailCode_EmailContainsHtmlBody()
        {
            var dto = new EmailCodeRequestDto { Email = "body-test@example.com" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var email = _sentEmails.FirstOrDefault(e => e.ToEmail == "body-test@example.com");
            email.Should().NotBeNull();
            email!.HtmlBody.Should().Contain("<");
            email.HtmlBody.Should().Contain(">");
        }

        [Fact]
        public async Task RequestEmailCode_EmailBodyContainsCodeLifetime()
        {
            var dto = new EmailCodeRequestDto { Email = "lifetime-test@example.com" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var email = _sentEmails.FirstOrDefault(e => e.ToEmail == "lifetime-test@example.com");
            email.Should().NotBeNull();
            email!.HtmlBody.Should().Contain("10 мин");
        }

        [Fact]
        public async Task RequestEmailCode_MultipleRequestsForDifferentEmails_SendsMultipleEmails()
        {
            await _client.PostAsJsonAsync("/api/auth/email/request", new EmailCodeRequestDto { Email = "multi1@example.com" });
            await _client.PostAsJsonAsync("/api/auth/email/request", new EmailCodeRequestDto { Email = "multi2@example.com" });

            _sentEmails.Should().HaveCount(2);
            _sentEmails.Should().Contain(e => e.ToEmail == "multi1@example.com");
            _sentEmails.Should().Contain(e => e.ToEmail == "multi2@example.com");
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
                _testUserId = user.Id;
            }

            if (!db.Workspaces.Any())
            {
                var workspace = new Workspace
                {
                    Name = "Тестовый Workspace",
                    CreatedByUserId = _testUserId,
                    CreatedAt = DateTime.UtcNow
                };
                db.Workspaces.Add(workspace);
                db.SaveChanges();
                _testWorkspaceId = workspace.Id;

                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = workspace.Id,
                    UserId = _testUserId,
                    Role = WorkspaceRole.Owner,
                    AddedAt = DateTime.UtcNow
                });
                db.SaveChanges();
            }
        }
    }

    public class EmailRecord
    {
        public string ToEmail { get; set; } = string.Empty;
        public string Subject { get; set; } = string.Empty;
        public string HtmlBody { get; set; } = string.Empty;
    }

    public class RecordingEmailSender : IEmailSender
    {
        private readonly List<EmailRecord> _records;

        public RecordingEmailSender(List<EmailRecord> records)
        {
            _records = records;
        }

        public Task SendAsync(string toEmail, string subject, string htmlBody)
        {
            _records.Add(new EmailRecord
            {
                ToEmail = toEmail,
                Subject = subject,
                HtmlBody = htmlBody
            });
            return Task.CompletedTask;
        }
    }
}
