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
using TaskManager.Infrastructure.Data;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    public class AuthApiTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
    {
        private const string JwtIssuer = "GoodTaskTracker";
        private const string JwtAudience = "GoodTaskTracker.Client";
        private const string JwtSigningKey = "CHANGE_ME_IN_PRODUCTION_WITH_32_PLUS_CHARS";

        private readonly HttpClient _client;
        private readonly WebApplicationFactory<Program> _factory;
        private int _testWorkspaceId;
        private int _testUserId;

        public AuthApiTests(WebApplicationFactory<Program> factory)
        {
            var dbName = $"TestDb_{Guid.NewGuid()}";

            _factory = factory.WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    var descriptor = services.SingleOrDefault(
                        d => d.ServiceType == typeof(Microsoft.EntityFrameworkCore.DbContextOptions<ApplicationDbContext>));

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

                    services.RemoveAll<IEmailSender>();
                    services.AddScoped<IEmailSender, FakeEmailSender>();

                    services.RemoveAll<JwtSettings>();
                    var jwtSettings = new JwtSettings
                    {
                        Issuer = JwtIssuer,
                        Audience = JwtAudience,
                        SigningKey = JwtSigningKey
                    };
                    services.AddSingleton(jwtSettings);

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
        }

        [Fact]
        public async Task RequestEmailCode_WithValidEmail_ReturnsOkWithDevelopmentCode()
        {
            var dto = new EmailCodeRequestDto { Email = "newuser@example.com" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var result = await response.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();
            result.Should().NotBeNull();
            result!.ResendAfterSeconds.Should().BeGreaterThan(0);
            result.ExpiresInSeconds.Should().BeGreaterThan(0);
            result.DevelopmentCode.Should().NotBeNullOrEmpty();
        }

        [Fact]
        public async Task RequestEmailCode_WithInvalidEmail_ReturnsBadRequest()
        {
            var dto = new EmailCodeRequestDto { Email = "invalid-email" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task RequestEmailCode_WithEmptyEmail_ReturnsBadRequest()
        {
            var dto = new EmailCodeRequestDto { Email = "" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task RequestEmailCode_WithTooLongEmail_ReturnsBadRequest()
        {
            var dto = new EmailCodeRequestDto { Email = new string('a', 90) + "@example.com" };

            var response = await _client.PostAsJsonAsync("/api/auth/email/request", dto);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task RequestEmailCode_TwiceWithinCooldown_ReturnsSameCode()
        {
            var email = "cooldown@example.com";
            var dto = new EmailCodeRequestDto { Email = email };

            var firstResponse = await _client.PostAsJsonAsync("/api/auth/email/request", dto);
            var firstResult = await firstResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            await Task.Delay(100);

            var secondResponse = await _client.PostAsJsonAsync("/api/auth/email/request", dto);
            secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var secondResult = await secondResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            secondResult!.ResendAfterSeconds.Should().BeGreaterThan(0);
        }

        [Fact]
        public async Task VerifyEmailCode_WithValidCode_ReturnsTokenAndCreatesUser()
        {
            var email = "verify@example.com";
            var requestDto = new EmailCodeRequestDto { Email = email };
            var requestResponse = await _client.PostAsJsonAsync("/api/auth/email/request", requestDto);
            var requestResult = await requestResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            var verifyDto = new EmailCodeVerifyDto { Email = email, Code = requestResult!.DevelopmentCode! };
            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);

            verifyResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var token = await verifyResponse.Content.ReadFromJsonAsync<AuthTokenResponseDto>();
            token.Should().NotBeNull();
            token!.AccessToken.Should().NotBeNullOrEmpty();
            token.TokenType.Should().Be("Bearer");
            token.User.Email.Should().Be(email);
            token.User.Id.Should().BeGreaterThan(0);
        }

        [Fact]
        public async Task VerifyEmailCode_WithInvalidCode_ReturnsBadRequest()
        {
            var email = "invalid-code@example.com";
            var requestDto = new EmailCodeRequestDto { Email = email };
            await _client.PostAsJsonAsync("/api/auth/email/request", requestDto);

            var verifyDto = new EmailCodeVerifyDto { Email = email, Code = "000000" };
            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);

            verifyResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task VerifyEmailCode_WithExpiredCode_ReturnsBadRequest()
        {
            var email = "expired@example.com";

            using (var scope = _factory.Services.CreateScope())
            {
                var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                dbContext.EmailAuthCodes.Add(new EmailAuthCode
                {
                    Email = email,
                    CodeHash = "test",
                    CodeSalt = "test",
                    CreatedAtUtc = DateTime.UtcNow.AddMinutes(-20),
                    ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-10),
                    ResendAvailableAtUtc = DateTime.UtcNow.AddMinutes(-19),
                    IsConsumed = false
                });
                await dbContext.SaveChangesAsync();
            }

            var verifyDto = new EmailCodeVerifyDto { Email = email, Code = "123456" };
            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);

            verifyResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task VerifyEmailCode_AfterMaxAttempts_ReturnsBadRequest()
        {
            var email = "maxattempts@example.com";
            var requestDto = new EmailCodeRequestDto { Email = email };
            var requestResponse = await _client.PostAsJsonAsync("/api/auth/email/request", requestDto);
            var requestResult = await requestResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            var verifyDto = new EmailCodeVerifyDto { Email = email, Code = "000000" };

            for (int i = 0; i < 5; i++)
            {
                await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);
            }

            var finalResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);
            finalResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task VerifyEmailCode_WithEmptyCode_ReturnsBadRequest()
        {
            var verifyDto = new EmailCodeVerifyDto { Email = "test@example.com", Code = "" };
            var response = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task VerifyEmailCode_WithShortCode_ReturnsBadRequest()
        {
            var verifyDto = new EmailCodeVerifyDto { Email = "test@example.com", Code = "12" };
            var response = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task VerifyEmailCode_ExistingUser_ReturnsSameUserId()
        {
            var email = "existing@example.com";

            var requestDto = new EmailCodeRequestDto { Email = email };
            var requestResponse = await _client.PostAsJsonAsync("/api/auth/email/request", requestDto);
            var requestResult = await requestResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            var verifyDto = new EmailCodeVerifyDto { Email = email, Code = requestResult!.DevelopmentCode! };
            var firstVerify = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);
            var firstToken = await firstVerify.Content.ReadFromJsonAsync<AuthTokenResponseDto>();

            var secondRequestDto = new EmailCodeRequestDto { Email = email };
            var secondRequestResponse = await _client.PostAsJsonAsync("/api/auth/email/request", secondRequestDto);
            var secondRequestResult = await secondRequestResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            var secondVerifyDto = new EmailCodeVerifyDto { Email = email, Code = secondRequestResult!.DevelopmentCode! };
            var secondVerify = await _client.PostAsJsonAsync("/api/auth/email/verify", secondVerifyDto);
            var secondToken = await secondVerify.Content.ReadFromJsonAsync<AuthTokenResponseDto>();

            secondToken!.User.Id.Should().Be(firstToken!.User.Id);
        }

        [Fact]
        public async Task Me_WithValidToken_ReturnsCurrentUser()
        {
            var token = await GetAuthTokenAsync("me-test@example.com");
            _client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await _client.GetAsync("/api/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var user = await response.Content.ReadFromJsonAsync<AuthUserDto>();
            user.Should().NotBeNull();
            user!.Email.Should().Be("me-test@example.com");
        }

        [Fact]
        public async Task Me_WithoutToken_ReturnsUnauthorized()
        {
            var client = _factory.CreateClient();

            var response = await client.GetAsync("/api/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task SwitchWorkspace_WithValidWorkspace_ReturnsNewToken()
        {
            var token = await GetAuthTokenAsync("switch@example.com");
            _client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var createWorkspaceResponse = await _client.PostAsJsonAsync("/api/spaces", new { Name = "Test Workspace" });
            createWorkspaceResponse.StatusCode.Should().Be(HttpStatusCode.Created);
            var workspace = await createWorkspaceResponse.Content.ReadFromJsonAsync<WorkspaceDto>();

            var dto = new SwitchWorkspaceRequestDto { WorkspaceId = workspace!.Id };
            var response = await _client.PostAsJsonAsync("/api/auth/switch-workspace", dto);

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var result = await response.Content.ReadFromJsonAsync<AuthTokenResponseDto>();
            result.Should().NotBeNull();
            result!.WorkspaceId.Should().Be(workspace.Id);
        }

        [Fact]
        public async Task SwitchWorkspace_WithInvalidWorkspace_ReturnsForbidden()
        {
            var token = await GetAuthTokenAsync("switch-invalid@example.com");
            _client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var dto = new SwitchWorkspaceRequestDto { WorkspaceId = 99999 };
            var response = await _client.PostAsJsonAsync("/api/auth/switch-workspace", dto);

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }

        [Fact]
        public async Task SwitchWorkspace_WithoutToken_ReturnsUnauthorized()
        {
            var client = _factory.CreateClient();

            var dto = new SwitchWorkspaceRequestDto { WorkspaceId = 1 };
            var response = await client.PostAsJsonAsync("/api/auth/switch-workspace", dto);

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task SwitchWorkspace_WithZeroWorkspaceId_ReturnsBadRequest()
        {
            var token = await GetAuthTokenAsync("switch-zero@example.com");
            _client.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var dto = new SwitchWorkspaceRequestDto { WorkspaceId = 0 };
            var response = await _client.PostAsJsonAsync("/api/auth/switch-workspace", dto);

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        private async Task<string> GetAuthTokenAsync(string email)
        {
            var requestDto = new EmailCodeRequestDto { Email = email };
            var requestResponse = await _client.PostAsJsonAsync("/api/auth/email/request", requestDto);
            var requestResult = await requestResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            var verifyDto = new EmailCodeVerifyDto { Email = email, Code = requestResult!.DevelopmentCode! };
            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", verifyDto);
            var token = await verifyResponse.Content.ReadFromJsonAsync<AuthTokenResponseDto>();

            return token!.AccessToken;
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
                    Role = Domain.Enums.WorkspaceRole.Owner,
                    AddedAt = DateTime.UtcNow
                });
                db.SaveChanges();
            }
        }
    }

    public class FakeEmailSender : IEmailSender
    {
        public Task SendAsync(string toEmail, string subject, string htmlBody)
        {
            throw new InvalidOperationException("SMTP not configured in tests");
        }
    }
}
