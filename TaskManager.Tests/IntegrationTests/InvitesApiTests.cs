using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    [Trait("Category", "Invites")]
    public class InvitesApiTests : TestBase
    {
        public InvitesApiTests(WebApplicationFactory<Program> factory) : base(factory) { }

        [Fact]
        public async Task CreateInvite_ForExistingUser_CreatesInviteAndNotification()
        {
            int invitedUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "Invited User",
                    Email = "invited.user@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "invited.user@example.com",
                role = 1
            });

            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();
            created!.WorkspaceId.Should().Be(TestWorkspaceId);
            created.InvitedEmail.Should().Be("invited.user@example.com");

            var invitedClient = CreateAuthorizedClient(workspaceId: null, userId: invitedUserId);

            var invitesResponse = await invitedClient.GetAsync("/api/invites/me?status=Pending");
            invitesResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var invites = await invitesResponse.Content.ReadFromJsonAsync<List<WorkspaceInvitationDto>>();
            invites.Should().NotBeNull();
            invites!.Should().Contain(i => i.Id == created.Id);

            var notificationsResponse = await invitedClient.GetAsync("/api/notifications?unreadOnly=true");
            notificationsResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var notifications = await notificationsResponse.Content.ReadFromJsonAsync<List<NotificationDto>>();
            notifications.Should().NotBeNull();
            notifications!.Should().Contain(n => n.Type == "workspace_invite_received" && n.WorkspaceId == TestWorkspaceId);
        }

        [Fact]
        public async Task AcceptInvite_AddsInvitedUserToWorkspace()
        {
            int invitedUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "Second Invited",
                    Email = "second.invited@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "second.invited@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();

            var invitedClient = CreateAuthorizedClient(workspaceId: null, userId: invitedUserId);
            var acceptResponse = await invitedClient.PostAsync($"/api/invites/{created!.Id}/accept", null);
            acceptResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            using var verifyScope = _factory.Services.CreateScope();
            var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var isMember = await verifyDb.WorkspaceMembers.AnyAsync(m => m.WorkspaceId == TestWorkspaceId && m.UserId == invitedUserId);
            isMember.Should().BeTrue();
        }
    }
}
