using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using System.IO;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using TaskManager.Tests.Helpers;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    [Trait("Category", "Tasks")]
    public class TasksApiTests : TestBase
    {
        public TasksApiTests(WebApplicationFactory<Program> factory) : base(factory) { }

        private async Task<(HttpClient client, int userId)> CreateWorkspaceMemberClientAsync(WorkspaceRole role, string name)
        {
            int userId;

            using (var scope = _factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = new User
                {
                    Name = name,
                    Email = $"workspace.{role.ToString().ToLowerInvariant()}.{Guid.NewGuid():N}@example.com",
                    CreatedAt = DateTime.UtcNow
                };

                db.Users.Add(user);
                await db.SaveChangesAsync();
                userId = user.Id;

                db.WorkspaceMembers.Add(new WorkspaceMember
                {
                    WorkspaceId = TestWorkspaceId,
                    UserId = userId,
                    Role = role,
                    AddedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
            }

            return (CreateAuthorizedClient(workspaceId: TestWorkspaceId, userId: userId), userId);
        }

        [Fact]
        public async Task GetTasks_ReturnsSuccessAndList()
        {
            var response = await _client.GetAsync("/api/Tasks");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();
            tasks.Should().NotBeNull();
            tasks.Should().HaveCountGreaterThanOrEqualTo(1);
        }

        [Fact]
        public async Task GetTasks_AfterAttachmentUpload_ReturnsAttachmentCount()
        {
            var listResponse = await _client.GetAsync("/api/Tasks");
            listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await listResponse.Content.ReadFromJsonAsync<List<TaskDto>>();
            tasks.Should().NotBeNull();
            var task = tasks!.First();

            using var form = new MultipartFormDataContent();
            var payload = new ByteArrayContent(Encoding.UTF8.GetBytes("attachment-content"));
            payload.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
            form.Add(payload, "files", "note.txt");

            var uploadResponse = await _client.PostAsync($"/api/tasks/{task.Id}/attachments", form);
            uploadResponse.StatusCode.Should().Be(HttpStatusCode.OK);

            var refreshedResponse = await _client.GetAsync("/api/Tasks");
            refreshedResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var refreshed = await refreshedResponse.Content.ReadFromJsonAsync<List<TaskDto>>();

            refreshed.Should().NotBeNull();
            var updated = refreshed!.First(t => t.Id == task.Id);
            updated.AttachmentCount.Should().BeGreaterThanOrEqualTo(1);

            var byIdResponse = await _client.GetAsync($"/api/Tasks/{task.Id}");
            byIdResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var byId = await byIdResponse.Content.ReadFromJsonAsync<TaskDto>();
            byId.Should().NotBeNull();
            byId!.AttachmentCount.Should().BeGreaterThanOrEqualTo(1);
        }

        [Fact]
        public async Task CreateTask_WhenStaleAttachmentFolderExists_ReturnsZeroAttachmentCount()
        {
            var listResponse = await _client.GetAsync("/api/Tasks");
            listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await listResponse.Content.ReadFromJsonAsync<List<TaskDto>>();
            tasks.Should().NotBeNull();

            var nextTaskId = tasks!
                .Select(t => t.Id)
                .DefaultIfEmpty(0)
                .Max() + 1;

            var staleFolder = Path.Combine(AttachmentStorageRootPath, "App_Data", "attachments", $"task-{nextTaskId}");
            Directory.CreateDirectory(staleFolder);

            var staleIndexPath = Path.Combine(staleFolder, "index.json");
            await File.WriteAllTextAsync(staleIndexPath, $$"""
            {
              "Items": {
                "stale": {
                  "Id": "stale",
                  "TaskId": {{nextTaskId}},
                  "FileName": "ghost.jpg",
                  "StoredName": "ghost.jpg",
                  "ContentType": "image/jpeg",
                  "Size": 256,
                  "UploadedAtUtc": "2026-01-01T00:00:00Z"
                }
              }
            }
            """);

            var dto = TestDataFactory.CreateValidTask(TestUserId);
            dto.Title = "123";

            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", dto);
            createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

            var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();
            created.Should().NotBeNull();
            created!.Id.Should().Be(nextTaskId);
            created.AttachmentCount.Should().Be(0);

            var getByIdResponse = await _client.GetAsync($"/api/Tasks/{created.Id}");
            getByIdResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var byId = await getByIdResponse.Content.ReadFromJsonAsync<TaskDto>();
            byId.Should().NotBeNull();
            byId!.AttachmentCount.Should().Be(0);
        }

        [Fact]
        public async Task DeleteTask_RemovesTaskAttachmentFolder()
        {
            var listResponse = await _client.GetAsync("/api/Tasks");
            listResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await listResponse.Content.ReadFromJsonAsync<List<TaskDto>>();
            tasks.Should().NotBeNull();
            var task = tasks!.First();

            using (var form = new MultipartFormDataContent())
            {
                var payload = new ByteArrayContent(Encoding.UTF8.GetBytes("attachment-content"));
                payload.Headers.ContentType = new MediaTypeHeaderValue("text/plain");
                form.Add(payload, "files", "note.txt");

                var uploadResponse = await _client.PostAsync($"/api/tasks/{task.Id}/attachments", form);
                uploadResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            }

            var attachmentFolder = Path.Combine(AttachmentStorageRootPath, "App_Data", "attachments", $"task-{task.Id}");
            Directory.Exists(attachmentFolder).Should().BeTrue();

            var deleteResponse = await _client.DeleteAsync($"/api/Tasks/{task.Id}");
            deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

            Directory.Exists(attachmentFolder).Should().BeFalse();
        }

        [Fact]
        public async Task GetTasks_WithStatusFilter_ReturnsFilteredTasks()
        {
            var response = await _client.GetAsync("/api/Tasks?status=New");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();
            tasks.Should().NotBeNull();
            tasks.Should().OnlyContain(t => t.Status == TaskItemStatus.New);
        }

        [Fact]
        public async Task GetTask_WithExistingId_ReturnsTask()
        {
            var tasksResponse = await _client.GetAsync("/api/Tasks");
            var tasks = await tasksResponse.Content.ReadFromJsonAsync<List<TaskDto>>();
            var firstTask = tasks!.First();

            var response = await _client.GetAsync($"/api/Tasks/{firstTask.Id}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var task = await response.Content.ReadFromJsonAsync<TaskDto>();
            task.Should().NotBeNull();
            task!.Id.Should().Be(firstTask.Id);
        }

        [Fact]
        public async Task GetTask_WithNonExistingId_ReturnsNotFound()
        {
            var response = await _client.GetAsync("/api/Tasks/99999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task CreateTask_WithValidData_ReturnsCreated()
        {
            var newTask = TestDataFactory.CreateValidTask(TestUserId);

            var response = await _client.PostAsJsonAsync("/api/Tasks", newTask);
            response.StatusCode.Should().Be(HttpStatusCode.Created);

            var createdTask = await response.Content.ReadFromJsonAsync<TaskDto>();
            createdTask.Should().NotBeNull();
            createdTask!.Title.Should().Be(newTask.Title);
            createdTask.WorkspaceId.Should().Be(TestWorkspaceId);
        }

        [Fact]
        public async Task CreateTask_WithoutTitle_ReturnsBadRequest()
        {
            var invalidTask = TestDataFactory.CreateTaskWithoutTitle();

            var response = await _client.PostAsJsonAsync("/api/Tasks", invalidTask);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task CreateTask_WithNonExistingAssignee_ReturnsBadRequest()
        {
            var newTask = TestDataFactory.CreateValidTask(99999);

            var response = await _client.PostAsJsonAsync("/api/Tasks", newTask);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task UpdateTask_WithValidData_ReturnsOk()
        {
            var tasksResponse = await _client.GetAsync("/api/Tasks");
            var tasks = await tasksResponse.Content.ReadFromJsonAsync<List<TaskDto>>();
            var firstTask = tasks!.First();

            var updatedTask = new UpdateTaskDto
            {
                Id = firstTask.Id,
                Title = "Обновленное название",
                Description = firstTask.Description,
                Status = TaskItemStatus.InProgress,
                AssigneeId = firstTask.AssigneeId,
                DueDate = firstTask.DueDate,
                Priority = firstTask.Priority,
                TagIds = firstTask.TagIds
            };

            var response = await _client.PutAsJsonAsync($"/api/Tasks/{firstTask.Id}", updatedTask);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var result = await response.Content.ReadFromJsonAsync<TaskDto>();
            result!.Title.Should().Be("Обновленное название");
            result.Status.Should().Be(TaskItemStatus.InProgress);
        }

        [Fact]
        public async Task UpdateTask_WithNonExistingId_ReturnsNotFound()
        {
            var updatedTask = new UpdateTaskDto
            {
                Id = 99999,
                Title = "Несуществующая задача",
                Description = "Описание",
                Status = TaskItemStatus.New,
                AssigneeId = TestUserId,
                DueDate = DateTime.UtcNow.AddDays(7),
                Priority = TaskPriority.Medium,
                TagIds = new List<int>()
            };

            var response = await _client.PutAsJsonAsync("/api/Tasks/99999", updatedTask);
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task UpdateTask_StatusToDone_SetsCompletedAt()
        {
            var newTask = TestDataFactory.CreateValidTask(TestUserId);
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", newTask);
            var createdTask = await createResponse.Content.ReadFromJsonAsync<TaskDto>();

            var updateDto = new UpdateTaskDto
            {
                Id = createdTask!.Id,
                Title = createdTask.Title,
                Description = createdTask.Description,
                Status = TaskItemStatus.Done,
                AssigneeId = createdTask.AssigneeId,
                DueDate = createdTask.DueDate,
                Priority = createdTask.Priority,
                TagIds = createdTask.TagIds
            };

            var response = await _client.PutAsJsonAsync($"/api/Tasks/{createdTask.Id}", updateDto);
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var getResponse = await _client.GetAsync($"/api/Tasks/{createdTask.Id}");
            var updated = await getResponse.Content.ReadFromJsonAsync<TaskDto>();
            updated!.Status.Should().Be(TaskItemStatus.Done);
            updated.CompletedAt.Should().NotBeNull();
        }

        [Fact]
        public async Task DeleteTask_WithExistingId_ReturnsNoContent()
        {
            var newTask = TestDataFactory.CreateValidTask(TestUserId);
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", newTask);
            var createdTask = await createResponse.Content.ReadFromJsonAsync<TaskDto>();

            var response = await _client.DeleteAsync($"/api/Tasks/{createdTask!.Id}");
            response.StatusCode.Should().Be(HttpStatusCode.NoContent);

            var getResponse = await _client.GetAsync($"/api/Tasks/{createdTask.Id}");
            getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task DeleteTask_WithNonExistingId_ReturnsNotFound()
        {
            var response = await _client.DeleteAsync("/api/Tasks/99999");
            response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        }

        [Fact]
        public async Task GetTasks_WithoutWorkspaceHeader_ReturnsBadRequest()
        {
            var clientWithoutWorkspace = CreateAuthorizedClient(workspaceId: null);

            var response = await clientWithoutWorkspace.GetAsync("/api/Tasks");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task GetTasks_WithoutAuthHeader_ReturnsUnauthorized()
        {
            var clientWithoutAuth = _factory.CreateClient();

            var response = await clientWithoutAuth.GetAsync("/api/Tasks");
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }

        [Fact]
        public async Task Member_MarksDone_TaskBecomesPendingAndManagersGetNotification()
        {
            var (memberClient, memberUserId) = await CreateWorkspaceMemberClientAsync(WorkspaceRole.Member, "Workspace Member");

            var createDto = TestDataFactory.CreateValidTask(memberUserId);
            createDto.Title = "Task waiting approval";
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", createDto);
            createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();
            created.Should().NotBeNull();

            var updateDto = new UpdateTaskDto
            {
                Id = created!.Id,
                Title = created.Title,
                Description = created.Description,
                Status = TaskItemStatus.Done,
                AssigneeId = created.AssigneeId,
                DueDate = created.DueDate,
                Priority = created.Priority,
                TagIds = created.TagIds
            };

            var memberUpdate = await memberClient.PutAsJsonAsync($"/api/Tasks/{created.Id}", updateDto);
            memberUpdate.StatusCode.Should().Be(HttpStatusCode.OK);
            var updated = await memberUpdate.Content.ReadFromJsonAsync<TaskDto>();
            updated.Should().NotBeNull();
            updated!.Status.Should().Be(TaskItemStatus.Done);
            updated.DoneApprovalPending.Should().BeTrue();
            updated.DoneApprovalRequestedByUserId.Should().Be(memberUserId);
            updated.CompletedAt.Should().BeNull();

            var ownerNotifications = await _client.GetAsync("/api/notifications?unreadOnly=true");
            ownerNotifications.StatusCode.Should().Be(HttpStatusCode.OK);
            var ownerList = await ownerNotifications.Content.ReadFromJsonAsync<List<NotificationDto>>();
            ownerList.Should().NotBeNull();
            ownerList!.Should().Contain(n => n.Type == "task_done_pending_approval" && n.TaskId == created.Id);
        }

        [Fact]
        public async Task Owner_ApprovesPendingDone_TaskCompletesAndMemberGetsNotification()
        {
            var (memberClient, memberUserId) = await CreateWorkspaceMemberClientAsync(WorkspaceRole.Member, "Workspace Member");

            var createDto = TestDataFactory.CreateValidTask(memberUserId);
            createDto.Title = "Task approve flow";
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", createDto);
            createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();
            created.Should().NotBeNull();

            var memberDone = new UpdateTaskDto
            {
                Id = created!.Id,
                Title = created.Title,
                Description = created.Description,
                Status = TaskItemStatus.Done,
                AssigneeId = created.AssigneeId,
                DueDate = created.DueDate,
                Priority = created.Priority,
                TagIds = created.TagIds
            };
            var memberUpdate = await memberClient.PutAsJsonAsync($"/api/Tasks/{created.Id}", memberDone);
            memberUpdate.StatusCode.Should().Be(HttpStatusCode.OK);

            var approveResponse = await _client.PostAsync($"/api/Tasks/{created.Id}/done-approval/approve", content: null);
            approveResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var approved = await approveResponse.Content.ReadFromJsonAsync<TaskDto>();
            approved.Should().NotBeNull();
            approved!.Status.Should().Be(TaskItemStatus.Done);
            approved.DoneApprovalPending.Should().BeFalse();
            approved.CompletedAt.Should().NotBeNull();

            var memberNotifications = await memberClient.GetAsync("/api/notifications?unreadOnly=true");
            memberNotifications.StatusCode.Should().Be(HttpStatusCode.OK);
            var list = await memberNotifications.Content.ReadFromJsonAsync<List<NotificationDto>>();
            list.Should().NotBeNull();
            list!.Should().Contain(n => n.Type == "task_done_approved" && n.TaskId == created.Id);
        }

        [Fact]
        public async Task Owner_RejectsPendingDone_TaskReturnsToNewAndMemberGetsNotification()
        {
            var (memberClient, memberUserId) = await CreateWorkspaceMemberClientAsync(WorkspaceRole.Member, "Workspace Member");

            var createDto = TestDataFactory.CreateValidTask(memberUserId);
            createDto.Title = "Task reject flow";
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", createDto);
            createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
            var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();
            created.Should().NotBeNull();

            var memberDone = new UpdateTaskDto
            {
                Id = created!.Id,
                Title = created.Title,
                Description = created.Description,
                Status = TaskItemStatus.Done,
                AssigneeId = created.AssigneeId,
                DueDate = created.DueDate,
                Priority = created.Priority,
                TagIds = created.TagIds
            };
            var memberUpdate = await memberClient.PutAsJsonAsync($"/api/Tasks/{created.Id}", memberDone);
            memberUpdate.StatusCode.Should().Be(HttpStatusCode.OK);

            var rejectResponse = await _client.PostAsync($"/api/Tasks/{created.Id}/done-approval/reject", content: null);
            rejectResponse.StatusCode.Should().Be(HttpStatusCode.OK);
            var rejected = await rejectResponse.Content.ReadFromJsonAsync<TaskDto>();
            rejected.Should().NotBeNull();
            rejected!.Status.Should().Be(TaskItemStatus.New);
            rejected.DoneApprovalPending.Should().BeFalse();
            rejected.CompletedAt.Should().BeNull();

            var memberNotifications = await memberClient.GetAsync("/api/notifications?unreadOnly=true");
            memberNotifications.StatusCode.Should().Be(HttpStatusCode.OK);
            var list = await memberNotifications.Content.ReadFromJsonAsync<List<NotificationDto>>();
            list.Should().NotBeNull();
            list!.Should().Contain(n => n.Type == "task_done_rejected" && n.TaskId == created.Id);
        }
    }
}
