using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
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

        [Fact]
        public async Task DeclineInvite_SetsStatusToDeclined()
        {
            int invitedUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "Declined User",
                    Email = "declined.user@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "declined.user@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();

            var invitedClient = CreateAuthorizedClient(workspaceId: null, userId: invitedUserId);
            var declineResponse = await invitedClient.PostAsync($"/api/invites/{created!.Id}/decline", null);
            declineResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var declinedInvite = await declineResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            declinedInvite.Should().NotBeNull();
            declinedInvite!.Status.Should().Be(WorkspaceInvitationStatus.Declined);
            declinedInvite.CanRespond.Should().BeFalse();

            using var verifyScope = _factory.Services.CreateScope();
            var verifyDb = verifyScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var isMember = await verifyDb.WorkspaceMembers.AnyAsync(m => m.WorkspaceId == TestWorkspaceId && m.UserId == invitedUserId);
            isMember.Should().BeFalse();
        }

        [Fact]
        public async Task AcceptAlreadyAcceptedInvite_ReturnsBadRequest()
        {
            int invitedUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "Double Accept User",
                    Email = "double.accept@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "double.accept@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();

            var invitedClient = CreateAuthorizedClient(workspaceId: null, userId: invitedUserId);
            var firstAccept = await invitedClient.PostAsync($"/api/invites/{created!.Id}/accept", null);
            firstAccept.StatusCode.Should().Be(HttpStatusCode.OK);

            var secondAccept = await invitedClient.PostAsync($"/api/invites/{created.Id}/accept", null);
            secondAccept.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task AcceptDeclinedInvite_ReturnsBadRequest()
        {
            int invitedUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "Accept After Decline",
                    Email = "accept.after.decline@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "accept.after.decline@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();

            var invitedClient = CreateAuthorizedClient(workspaceId: null, userId: invitedUserId);
            var declineResponse = await invitedClient.PostAsync($"/api/invites/{created!.Id}/decline", null);
            declineResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var acceptResponse = await invitedClient.PostAsync($"/api/invites/{created.Id}/accept", null);
            acceptResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task WrongUserAcceptsInvite_ReturnsForbidden()
        {
            int invitedUserId;
            int anotherUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "Real Invited",
                    Email = "real.invited@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                var anotherUser = new User
                {
                    Name = "Another User",
                    Email = "another.user@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                db.Users.Add(anotherUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
                anotherUserId = anotherUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "real.invited@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();

            var wrongClient = CreateAuthorizedClient(workspaceId: null, userId: anotherUserId);
            var acceptResponse = await wrongClient.PostAsync($"/api/invites/{created!.Id}/accept", null);
            acceptResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }

        [Fact]
        public async Task InviteAlreadyMember_ReturnsBadRequest()
        {
            int existingMemberId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var member = new User
                {
                    Name = "Existing Member",
                    Email = "existing.member@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(member);
                await db.SaveChangesAsync();
                existingMemberId = member.Id;

                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = TestWorkspaceId,
                    UserId = existingMemberId,
                    Role = WorkspaceRole.Member,
                    AddedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "existing.member@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateDuplicateInvite_ReturnsConflict()
        {
            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "duplicate@test.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var duplicateResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "duplicate@test.com",
                role = 1
            });
            duplicateResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);
        }

        [Fact]
        public async Task GetMyInvites_WithStatusFilter_ReturnsFilteredInvites()
        {
            int invitedUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "Filter Test User",
                    Email = "filter.test@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "filter.test@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();

            var invitedClient = CreateAuthorizedClient(workspaceId: null, userId: invitedUserId);

            var pendingResponse = await invitedClient.GetAsync("/api/invites/me?status=Pending");
            pendingResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var pendingInvites = await pendingResponse.Content.ReadFromJsonAsync<List<WorkspaceInvitationDto>>();
            pendingInvites.Should().NotBeNull();
            pendingInvites!.Should().Contain(i => i.Id == created!.Id);

            await invitedClient.PostAsync($"/api/invites/{created!.Id}/accept", null);

            var acceptedResponse = await invitedClient.GetAsync("/api/invites/me?status=Accepted");
            acceptedResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var acceptedInvites = await acceptedResponse.Content.ReadFromJsonAsync<List<WorkspaceInvitationDto>>();
            acceptedInvites.Should().NotBeNull();
            acceptedInvites!.Should().Contain(i => i.Id == created.Id);

            var pendingResponse2 = await invitedClient.GetAsync("/api/invites/me?status=Pending");
            pendingResponse2.StatusCode.Should().Be(HttpStatusCode.OK);
            var pendingInvites2 = await pendingResponse2.Content.ReadFromJsonAsync<List<WorkspaceInvitationDto>>();
            pendingInvites2.Should().NotBeNull();
            pendingInvites2!.Should().NotContain(i => i.Id == created.Id);
        }

        [Fact]
        public async Task GetMyInvites_WithoutFilter_ReturnsAllInvites()
        {
            int invitedUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var invitedUser = new User
                {
                    Name = "All Invites User",
                    Email = "all.invites@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(invitedUser);
                await db.SaveChangesAsync();
                invitedUserId = invitedUser.Id;
            }

            var createResponse = await _client.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "all.invites@example.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var created = await createResponse.Content.ReadFromJsonAsync<WorkspaceInvitationDto>();
            created.Should().NotBeNull();

            var invitedClient = CreateAuthorizedClient(workspaceId: null, userId: invitedUserId);

            var allResponse = await invitedClient.GetAsync("/api/invites/me");
            allResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var allInvites = await allResponse.Content.ReadFromJsonAsync<List<WorkspaceInvitationDto>>();
            allInvites.Should().NotBeNull();
            allInvites!.Should().Contain(i => i.Id == created!.Id);
        }

        [Fact]
        public async Task MemberWithoutPermissions_CannotCreateInvite()
        {
            int memberUserId;
            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var member = new User
                {
                    Name = "Regular Member",
                    Email = "regular.member@example.com",
                    CreatedAt = DateTime.UtcNow
                };
                db.Users.Add(member);
                await db.SaveChangesAsync();
                memberUserId = member.Id;

                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = TestWorkspaceId,
                    UserId = memberUserId,
                    Role = WorkspaceRole.Member,
                    AddedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
            }

            var memberClient = CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: memberUserId);
            var createResponse = await memberClient.PostAsJsonAsync($"/api/Spaces/{TestWorkspaceId}/invites", new
            {
                email = "new.user@test.com",
                role = 1
            });
            createResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        }

        [Fact]
        public async Task AcceptNonExistentInvite_ReturnsNotFound()
        {
            var acceptResponse = await _client.PostAsync("/api/invites/99999/accept", null);
            acceptResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }
    }
}
