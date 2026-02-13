using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;
using System.Net.Http.Json;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Enums;
using TaskManager.Tests.Helpers;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    public class TasksApiTests : TestBase
    {
        public TasksApiTests(WebApplicationFactory<Program> factory) : base(factory) { }

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
            var clientWithoutWorkspace = _factory.CreateClient();
            clientWithoutWorkspace.DefaultRequestHeaders.Add("X-Actor-UserId", TestUserId.ToString());
            // Не добавляем X-Workspace-Id

            var response = await clientWithoutWorkspace.GetAsync("/api/Tasks");
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        [Fact]
        public async Task GetTasks_WithoutAuthHeader_ReturnsUnauthorized()
        {
            var clientWithoutAuth = _factory.CreateClient();
            clientWithoutAuth.DefaultRequestHeaders.Add("X-Workspace-Id", TestWorkspaceId.ToString());
            // Не добавляем X-Actor-UserId

            var response = await clientWithoutAuth.GetAsync("/api/Tasks");
            response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        }
    }
}
