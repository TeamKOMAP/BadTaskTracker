using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    [Trait("Category", "Spaces")]
    public class SpacesApiOwnershipTests : TestBase
    {
        public SpacesApiOwnershipTests(WebApplicationFactory<Program> factory) : base(factory) { }

        [Fact]
        public async Task Owner_CanUpdateWorkspace()
        {
            var response = await _client.PutAsJsonAsync($"/api/spaces/{TestWorkspaceId}", new
            {
                name = "Owner updated workspace"
            });

            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var updated = await response.Content.ReadFromJsonAsync<WorkspaceDto>();
            updated.Should().NotBeNull();
            updated!.Id.Should().Be(TestWorkspaceId);
            updated.Name.Should().Be("Owner updated workspace");
        }

        [Fact]
        public async Task Admin_CannotUpdateWorkspace()
        {
            var adminClient = await CreateAdminClientAsync();

            var response = await adminClient.PutAsJsonAsync($"/api/spaces/{TestWorkspaceId}", new
            {
                name = "Admin should not update workspace"
            });

            response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

            var workspaceResponse = await _client.GetAsync($"/api/spaces/{TestWorkspaceId}");
            workspaceResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var workspace = await workspaceResponse.Content.ReadFromJsonAsync<WorkspaceDto>();
            workspace.Should().NotBeNull();
            workspace!.Name.Should().NotBe("Admin should not update workspace");
        }

        [Fact]
        public async Task Admin_CannotManageWorkspaceAvatar()
        {
            var adminClient = await CreateAdminClientAsync();
            var imageBytes = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQfDdcQAAAAASUVORK5CYII=");

            using (var form = new MultipartFormDataContent())
            {
                var payload = new ByteArrayContent(imageBytes);
                payload.Headers.ContentType = new MediaTypeHeaderValue("image/png");
                form.Add(payload, "file", "avatar.png");

                var setAvatarResponse = await adminClient.PostAsync($"/api/spaces/{TestWorkspaceId}/avatar", form);
                setAvatarResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
            }

            var clearAvatarResponse = await adminClient.DeleteAsync($"/api/spaces/{TestWorkspaceId}/avatar");
            clearAvatarResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }

        private async Task<HttpClient> CreateAdminClientAsync()
        {
            int adminUserId;

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = new User
                {
                    Name = "Workspace Admin",
                    Email = $"workspace.admin.{Guid.NewGuid():N}@example.com",
                    CreatedAt = DateTime.UtcNow
                };

                db.Users.Add(user);
                await db.SaveChangesAsync();
                adminUserId = user.Id;

                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = TestWorkspaceId,
                    UserId = adminUserId,
                    Role = WorkspaceRole.Admin,
                    AddedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
            }

            return CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: adminUserId);
        }
    }
}
