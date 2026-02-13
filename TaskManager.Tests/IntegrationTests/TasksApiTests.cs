using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.VisualStudio.TestPlatform.TestHost;
using System.Net;
using System.Net.Http.Json;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Enums;
using TaskManager.Tests.Helpers;

namespace TaskManager.Tests.IntegrationTests;

public class TasksApiTests : TestBase
{
    public TasksApiTests(WebApplicationFactory<Program> factory) : base(factory) { }

    #region POST /api/Tasks

    [Fact]
    public async Task CreateTask_WithValidData_ReturnsCreated()
    {
        // Arrange
        var newTask = TestDataFactory.CreateValidTask();

        // Act
        var response = await _client.PostAsJsonAsync("/api/Tasks", newTask);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdTask = await response.Content.ReadFromJsonAsync<TaskDto>();
        createdTask.Should().NotBeNull();
        createdTask!.Id.Should().BeGreaterThan(0);
        createdTask.Title.Should().Be(newTask.Title);
        createdTask.Status.Should().Be(TaskItemStatus.New);
        createdTask.CreatedAt.Should().NotBe(default);
    }

    [Fact]
    public async Task CreateTask_WithoutTitle_ReturnsBadRequest()
    {
        // Arrange – используем неполный DTO, но можно просто передать невалидный объект
        var invalidTask = new
        {
            Description = "Задача без заголовка",
            AssigneeId = 1,
            DueDate = DateTime.UtcNow.AddDays(7),
            Priority = TaskPriority.Medium
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/Tasks", invalidTask);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task CreateTask_WithNonExistingAssignee_ReturnsBadRequest()
    {
        // Arrange
        var invalidTask = new CreateTaskDto
        {
            Title = "Тестовая задача",
            AssigneeId = 99999,
            DueDate = DateTime.UtcNow.AddDays(7),
            Priority = TaskPriority.Medium
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/Tasks", invalidTask);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    #endregion

    #region GET /api/Tasks

    [Fact]
    public async Task GetTasks_ReturnsSuccessAndList()
    {
        var response = await _client.GetAsync("/api/Tasks");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();
        tasks.Should().NotBeNull();
    }

    [Fact]
    public async Task GetTask_WithExistingId_ReturnsTask()
    {
        var allTasks = await _client.GetFromJsonAsync<List<TaskDto>>("/api/Tasks");
        var existingId = allTasks!.First().Id;

        var response = await _client.GetAsync($"/api/Tasks/{existingId}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var task = await response.Content.ReadFromJsonAsync<TaskDto>();
        task.Should().NotBeNull();
        task!.Id.Should().Be(existingId);
    }

    [Fact]
    public async Task GetTask_WithNonExistingId_ReturnsNotFound()
    {
        var response = await _client.GetAsync("/api/Tasks/99999");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetTasks_WithStatusFilter_ReturnsFilteredTasks()
    {
        var newTask = TestDataFactory.CreateValidTask();
        await _client.PostAsJsonAsync("/api/Tasks", newTask);

        var response = await _client.GetAsync($"/api/Tasks?status={TaskItemStatus.New}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();
        tasks.Should().NotBeNull();
        tasks!.All(t => t.Status == TaskItemStatus.New).Should().BeTrue();
    }

    [Fact]
    public async Task GetTasks_WithAssigneeFilter_ReturnsFilteredTasks()
    {
        var response = await _client.GetAsync("/api/Tasks?assigneeId=1");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();
        tasks.Should().NotBeNull();
        tasks!.All(t => t.AssigneeId == 1).Should().BeTrue();
    }

    #endregion

    #region PUT /api/Tasks/{id}

    [Fact]
    public async Task UpdateTask_WithValidData_ReturnsOk()
    {
        var allTasks = await _client.GetFromJsonAsync<List<TaskDto>>("/api/Tasks");
        var taskToUpdate = allTasks!.First();

        var updatedTask = new UpdateTaskDto
        {
            Id = taskToUpdate.Id,
            Title = "Обновленный заголовок",
            Description = taskToUpdate.Description,
            AssigneeId = taskToUpdate.AssigneeId,
            DueDate = taskToUpdate.DueDate,
            Status = taskToUpdate.Status,
            Priority = taskToUpdate.Priority,
            TagIds = taskToUpdate.TagIds ?? new List<int>()
        };

        var response = await _client.PutAsJsonAsync($"/api/Tasks/{taskToUpdate.Id}", updatedTask);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await response.Content.ReadFromJsonAsync<TaskDto>();
        updated!.Title.Should().Be("Обновленный заголовок");
    }

    [Fact]
    public async Task UpdateTask_StatusToDone_SetsCompletedAt()
    {
        var newTask = TestDataFactory.CreateValidTask();
        var createResponse = await _client.PostAsJsonAsync("/api/Tasks", newTask);
        var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();

        var updatedTask = new UpdateTaskDto
        {
            Id = created!.Id,
            Title = created.Title,
            Description = created.Description,
            AssigneeId = created.AssigneeId,
            DueDate = created.DueDate,
            Status = TaskItemStatus.Done,
            Priority = created.Priority,
            TagIds = created.TagIds ?? new List<int>()
        };

        var response = await _client.PutAsJsonAsync($"/api/Tasks/{created.Id}", updatedTask);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await response.Content.ReadFromJsonAsync<TaskDto>();
        updated!.CompletedAt.Should().NotBeNull();
        updated.Status.Should().Be(TaskItemStatus.Done);
    }

    [Fact]
    public async Task UpdateTask_WithNonExistingId_ReturnsNotFound()
    {
        var updatedTask = new UpdateTaskDto
        {
            Id = 99999,
            Title = "Несуществующая задача",
            Description = "Описание",
            AssigneeId = 1,
            DueDate = DateTime.UtcNow.AddDays(7),
            Status = TaskItemStatus.New,
            Priority = TaskPriority.Medium,
            TagIds = new List<int>()
        };

        var response = await _client.PutAsJsonAsync("/api/Tasks/99999", updatedTask);
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region DELETE /api/Tasks/{id}

    [Fact]
    public async Task DeleteTask_WithExistingId_ReturnsNoContent()
    {
        var newTask = TestDataFactory.CreateValidTask();
        var createResponse = await _client.PostAsJsonAsync("/api/Tasks", newTask);
        var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();

        var deleteResponse = await _client.DeleteAsync($"/api/Tasks/{created!.Id}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await _client.GetAsync($"/api/Tasks/{created.Id}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteTask_WithNonExistingId_ReturnsNotFound()
    {
        var response = await _client.DeleteAsync("/api/Tasks/99999");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion
}