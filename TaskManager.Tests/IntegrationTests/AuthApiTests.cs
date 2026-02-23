using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using System.Net;
using System.Net.Http.Headers;
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
    public class AuthApiTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
    {
        private const string JwtIssuer = "GoodTaskTracker";
        private const string JwtAudience = "GoodTaskTracker.Client";
        private const string JwtSigningKey = "BTT_JWT_5c2a9d1f7e4b8a6c3d0f2e1a9b7c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b";

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
                    services.AddSingleton<IEmailSender>(new ThrowingEmailSender());

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

        public void Dispose() { }

        [Fact]
        public async Task RequestEmailCode_WithValidEmail_ReturnsSuccess()
        {
            var response = await _client.PostAsJsonAsync("/api/auth/email/request", new
            {
                email = "test@example.com"
            });

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
            var response = await _client.PostAsJsonAsync("/api/auth/email/request", new
            {
                email = "invalid-email"
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task RequestEmailCode_WithEmptyEmail_ReturnsBadRequest()
        {
            var response = await _client.PostAsJsonAsync("/api/auth/email/request", new
            {
                email = ""
            });

            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task VerifyEmailCode_WithValidCode_ReturnsToken()
        {
            var requestResponse = await _client.PostAsJsonAsync("/api/auth/email/request", new
            {
                email = "verify@example.com"
            });
            var requestResult = await requestResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", new
            {
                email = "verify@example.com",
                code = requestResult!.DevelopmentCode
            });

            verifyResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var tokenResult = await verifyResponse.Content.ReadFromJsonAsync<AuthTokenResponseDto>();
            tokenResult.Should().NotBeNull();
            tokenResult!.AccessToken.Should().NotBeNullOrEmpty();
            tokenResult.TokenType.Should().Be("Bearer");
            tokenResult.User.Email.Should().Be("verify@example.com");
        }

        [Fact]
        public async Task VerifyEmailCode_WithInvalidCode_ReturnsBadRequest()
        {
            await _client.PostAsJsonAsync("/api/auth/email/request", new
            {
                email = "invalid-code@example.com"
            });

            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", new
            {
                email = "invalid-code@example.com",
                code = "000000"
            });

            verifyResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task VerifyEmailCode_WithWrongEmail_ReturnsBadRequest()
        {
            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", new
            {
                email = "nonexistent@example.com",
                code = "123456"
            });

            verifyResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task GetCurrentUser_WithValidToken_ReturnsUser()
        {
            var token = await GetAuthTokenAsync("me@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await authClient.GetAsync("/api/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var user = await response.Content.ReadFromJsonAsync<AuthUserDto>();
            user.Should().NotBeNull();
            user!.Email.Should().Be("me@example.com");
            user.TimeZoneId.Should().Be("UTC");
        }

        [Fact]
        public async Task UpdateTimeZone_WithValidZone_StoresUserTimeZone()
        {
            var token = await GetAuthTokenAsync("timezone.valid@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var updateResponse = await authClient.PostAsJsonAsync("/api/auth/timezone", new
            {
                timeZoneId = "Europe/Moscow"
            });

            updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var updated = await updateResponse.Content.ReadFromJsonAsync<AuthUserDto>();
            updated.Should().NotBeNull();
            updated!.TimeZoneId.Should().Be("Europe/Moscow");

            var meResponse = await authClient.GetAsync("/api/auth/me");
            meResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var me = await meResponse.Content.ReadFromJsonAsync<AuthUserDto>();
            me.Should().NotBeNull();
            me!.TimeZoneId.Should().Be("Europe/Moscow");
        }

        [Fact]
        public async Task UpdateTimeZone_WithInvalidZone_FallsBackToUtc()
        {
            var token = await GetAuthTokenAsync("timezone.invalid@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var updateResponse = await authClient.PostAsJsonAsync("/api/auth/timezone", new
            {
                timeZoneId = "Invalid/Zone"
            });

            updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var updated = await updateResponse.Content.ReadFromJsonAsync<AuthUserDto>();
            updated.Should().NotBeNull();
            updated!.TimeZoneId.Should().Be("UTC");
        }

        [Fact]
        public async Task UpdateNickname_WithValidValue_StoresNameAndCooldown()
        {
            var token = await GetAuthTokenAsync("nickname.valid@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await authClient.PostAsJsonAsync("/api/auth/nickname", new
            {
                nickname = "Новый Ник"
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var updated = await response.Content.ReadFromJsonAsync<AuthUserDto>();
            updated.Should().NotBeNull();
            updated!.Name.Should().Be("Новый Ник");
            updated.NicknameChangeAvailableAtUtc.Should().NotBeNull();
            updated.NicknameChangeAvailableAtUtc!.Value.Kind.Should().Be(DateTimeKind.Utc);

            var meResponse = await authClient.GetAsync("/api/auth/me");
            meResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var me = await meResponse.Content.ReadFromJsonAsync<AuthUserDto>();
            me.Should().NotBeNull();
            me!.Name.Should().Be("Новый Ник");
            me.NicknameChangeAvailableAtUtc.Should().NotBeNull();
            me.NicknameChangeAvailableAtUtc!.Value.Kind.Should().Be(DateTimeKind.Utc);
        }

        [Fact]
        public async Task UpdateNickname_DuringCooldown_ReturnsBadRequest()
        {
            var token = await GetAuthTokenAsync("nickname.cooldown@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var first = await authClient.PostAsJsonAsync("/api/auth/nickname", new
            {
                nickname = "Первый Ник"
            });
            first.StatusCode.Should().Be(HttpStatusCode.OK);

            var second = await authClient.PostAsJsonAsync("/api/auth/nickname", new
            {
                nickname = "Второй Ник"
            });

            second.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task UpdateNickname_PropagatesToWorkspaceMembers()
        {
            var memberEmail = $"nickname.member.{Guid.NewGuid():N}@example.com";
            var memberToken = await GetAuthTokenAsync(memberEmail);
            var memberUserId = await AddUserToWorkspaceAsync(memberEmail, WorkspaceRole.Member);

            var memberClient = _factory.CreateClient();
            memberClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", memberToken);

            var updateResponse = await memberClient.PostAsJsonAsync("/api/auth/nickname", new
            {
                nickname = "Командный Ник"
            });

            updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var ownerToken = await GetAuthTokenAsync("test@example.com");
            var ownerClient = _factory.CreateClient();
            ownerClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", ownerToken);

            var membersResponse = await ownerClient.GetAsync($"/api/spaces/{_testWorkspaceId}/members");
            membersResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var members = await membersResponse.Content.ReadFromJsonAsync<List<WorkspaceMemberDto>>();

            members.Should().NotBeNull();
            members!.Should().Contain(m => m.UserId == memberUserId && m.Name == "Командный Ник");
        }

        [Fact]
        public async Task UpdateAvatar_WithValidImage_StoresAvatarPathAndPublicAccess()
        {
            var token = await GetAuthTokenAsync("avatar.valid@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            var imageBytes = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQfDdcQAAAAASUVORK5CYII=");

            using var form = new MultipartFormDataContent();
            var payload = new ByteArrayContent(imageBytes);
            payload.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            form.Add(payload, "file", "avatar.png");

            var response = await authClient.PostAsync("/api/auth/avatar", form);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var updated = await response.Content.ReadFromJsonAsync<AuthUserDto>();
            updated.Should().NotBeNull();
            updated!.AvatarPath.Should().NotBeNullOrWhiteSpace();

            var publicResponse = await _client.GetAsync(updated.AvatarPath!);
            publicResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var meResponse = await authClient.GetAsync("/api/auth/me");
            meResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var me = await meResponse.Content.ReadFromJsonAsync<AuthUserDto>();
            me.Should().NotBeNull();
            me!.AvatarPath.Should().Be(updated.AvatarPath);
        }

        [Fact]
        public async Task ClearAvatar_RemovesAvatarPath()
        {
            var token = await GetAuthTokenAsync("avatar.clear@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            var imageBytes = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQfDdcQAAAAASUVORK5CYII=");

            using (var form = new MultipartFormDataContent())
            {
                var payload = new ByteArrayContent(imageBytes);
                payload.Headers.ContentType = new MediaTypeHeaderValue("image/png");
                form.Add(payload, "file", "avatar.png");

                var uploadResponse = await authClient.PostAsync("/api/auth/avatar", form);
                uploadResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            var clearResponse = await authClient.DeleteAsync("/api/auth/avatar");
            clearResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var updated = await clearResponse.Content.ReadFromJsonAsync<AuthUserDto>();
            updated.Should().NotBeNull();
            string.IsNullOrWhiteSpace(updated!.AvatarPath).Should().BeTrue();
        }

        [Fact]
        public async Task UpdateAvatar_PropagatesToWorkspaceMembers()
        {
            var memberEmail = $"avatar.member.{Guid.NewGuid():N}@example.com";
            var memberToken = await GetAuthTokenAsync(memberEmail);
            var memberUserId = await AddUserToWorkspaceAsync(memberEmail, WorkspaceRole.Member);

            var memberClient = _factory.CreateClient();
            memberClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", memberToken);

            var imageBytes = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQfDdcQAAAAASUVORK5CYII=");

            using (var form = new MultipartFormDataContent())
            {
                var payload = new ByteArrayContent(imageBytes);
                payload.Headers.ContentType = new MediaTypeHeaderValue("image/png");
                form.Add(payload, "file", "avatar.png");

                var updateResponse = await memberClient.PostAsync("/api/auth/avatar", form);
                updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            var ownerToken = await GetAuthTokenAsync("test@example.com");
            var ownerClient = _factory.CreateClient();
            ownerClient.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", ownerToken);

            var membersResponse = await ownerClient.GetAsync($"/api/spaces/{_testWorkspaceId}/members");
            membersResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var members = await membersResponse.Content.ReadFromJsonAsync<List<WorkspaceMemberDto>>();

            members.Should().NotBeNull();
            members!.Should().Contain(m => m.UserId == memberUserId && !string.IsNullOrWhiteSpace(m.AvatarPath));
        }

        [Fact]
        public async Task GetCurrentUser_WithoutToken_ReturnsUnauthorized()
        {
            var clientWithoutAuth = _factory.CreateClient();

            var response = await clientWithoutAuth.GetAsync("/api/auth/me");

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task SwitchWorkspace_WithValidWorkspace_ReturnsNewToken()
        {
            var email = "switch@example.com";
            var token = await GetAuthTokenAsync(email);

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            
            var user = db.Users.First(u => u.Email == email);
            db.WorkspaceMembers.Add(new WorkspaceMember
            {
                WorkspaceId = _testWorkspaceId,
                UserId = user.Id,
                Role = WorkspaceRole.Member,
                AddedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();

            var response = await authClient.PostAsJsonAsync("/api/auth/switch-workspace", new
            {
                workspaceId = _testWorkspaceId
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var result = await response.Content.ReadFromJsonAsync<AuthTokenResponseDto>();
            result.Should().NotBeNull();
            result!.WorkspaceId.Should().Be(_testWorkspaceId);
        }

        [Fact]
        public async Task SwitchWorkspace_WithNonMemberWorkspace_ReturnsForbidden()
        {
            var token = await GetAuthTokenAsync("non-member@example.com");

            var authClient = _factory.CreateClient();
            authClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await authClient.PostAsJsonAsync("/api/auth/switch-workspace", new
            {
                workspaceId = 99999
            });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }

        [Fact]
        public async Task SwitchWorkspace_WithoutToken_ReturnsUnauthorized()
        {
            var clientWithoutAuth = _factory.CreateClient();

            var response = await clientWithoutAuth.PostAsJsonAsync("/api/auth/switch-workspace", new
            {
                workspaceId = 1
            });

            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task VerifyEmailCode_AfterInviteToNewEmail_CreatesInviteNotification()
        {
            var ownerToken = await GetAuthTokenAsync("test@example.com");
            var ownerClient = _factory.CreateClient();
            ownerClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", ownerToken);

            var createInviteResponse = await ownerClient.PostAsJsonAsync($"/api/spaces/{_testWorkspaceId}/invites", new
            {
                email = "late.invited@example.com",
                role = 1
            });
            createInviteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var invitedToken = await GetAuthTokenAsync("late.invited@example.com");
            var invitedClient = _factory.CreateClient();
            invitedClient.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", invitedToken);

            var notificationsResponse = await invitedClient.GetAsync("/api/notifications?unreadOnly=true");
            notificationsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var notifications = await notificationsResponse.Content.ReadFromJsonAsync<List<NotificationDto>>();
            notifications.Should().NotBeNull();
            notifications!.Should().Contain(n => n.Type == "workspace_invite_received" && n.WorkspaceId == _testWorkspaceId);
        }

        private async Task<string> GetAuthTokenAsync(string email)
        {
            var requestResponse = await _client.PostAsJsonAsync("/api/auth/email/request", new { email });
            var requestResult = await requestResponse.Content.ReadFromJsonAsync<EmailCodeRequestResultDto>();

            var verifyResponse = await _client.PostAsJsonAsync("/api/auth/email/verify", new
            {
                email,
                code = requestResult!.DevelopmentCode
            });

            var tokenResult = await verifyResponse.Content.ReadFromJsonAsync<AuthTokenResponseDto>();
            return tokenResult!.AccessToken;
        }

        private async Task<int> AddUserToWorkspaceAsync(string email, WorkspaceRole role)
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = await db.Users.FirstAsync(u => u.Email == email);

            if (!await db.WorkspaceMembers.AnyAsync(m => m.WorkspaceId == _testWorkspaceId && m.UserId == user.Id))
            {
                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = _testWorkspaceId,
                    UserId = user.Id,
                    Role = role,
                    AddedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
            }

            return user.Id;
        }

        private void SeedTestData(ApplicationDbContext db)
        {
            if (!db.Users.Any())
            {
                var user = new User
                {
                    Name = "Test User",
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
                    Name = "Test Workspace",
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

    internal class ThrowingEmailSender : IEmailSender
    {
        public Task SendAsync(string toEmail, string subject, string htmlBody)
        {
            throw new InvalidOperationException("Email sending is disabled in auth tests");
        }
    }
}
