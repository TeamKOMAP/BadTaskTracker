using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using TaskManager.Tests.Helpers;
using Xunit;

namespace TaskManager.Tests.IntegrationTests
{
    public class TaskFiltersTests : TestBase
    {
        public TaskFiltersTests(WebApplicationFactory<Program> factory) : base(factory) { }

        [Fact]
        public async Task GetTasks_WithStatusFilter_ReturnsOnlyMatchingTasks()
        {
            // Arrange
            var task1 = await CreateTaskAsync("Задача New", TaskItemStatus.New);
            var task2 = await CreateTaskAsync("Задача InProgress", TaskItemStatus.InProgress);
            var task3 = await CreateTaskAsync("Задача Done", TaskItemStatus.Done);

            // Act
            var response = await _client.GetAsync("/api/Tasks?status=New");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().NotBeNull();
            tasks.Should().Contain(t => t.Title == "Задача New");
            tasks.Should().NotContain(t => t.Title == "Задача InProgress");
            tasks.Should().NotContain(t => t.Title == "Задача Done");
        }

        [Fact]
        public async Task GetTasks_WithAssigneeFilter_ReturnsOnlyTasksForAssignee()
        {
            // Arrange
            using var scope = _factory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            
            var user2 = new User { Name = "Второй пользователь", Email = "user2@test.com" };
            dbContext.Users.Add(user2);
            dbContext.WorkspaceMembers.Add(new WorkspaceMember
            {
                WorkspaceId = TestWorkspaceId,
                UserId = user2.Id,
                Role = WorkspaceRole.Member,
                AddedAt = DateTime.UtcNow
            });
            await dbContext.SaveChangesAsync();

            var task1 = await CreateTaskAsync("Задача для User 1", TaskItemStatus.New, TestUserId);
            var task2 = await CreateTaskAsync("Задача для User 2", TaskItemStatus.New, user2.Id);

            // Act
            var response = await _client.GetAsync($"/api/Tasks?assigneeId={TestUserId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().Contain(t => t.Title == "Задача для User 1");
            tasks.Should().NotContain(t => t.Title == "Задача для User 2");
        }

        [Fact]
        public async Task GetTasks_WithDueBeforeFilter_ReturnsTasksBeforeDate()
        {
            // Arrange
            var futureDate = DateTime.UtcNow.AddDays(10);
            var pastDate = DateTime.UtcNow.AddDays(-5);
            
            using var scope = _factory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            
            var task1 = new TaskItem
            {
                Title = "Задача в прошлом",
                DueDate = pastDate,
                Status = TaskItemStatus.New,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            var task2 = new TaskItem
            {
                Title = "Задача в будущем",
                DueDate = futureDate,
                Status = TaskItemStatus.New,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            dbContext.Tasks.AddRange(task1, task2);
            await dbContext.SaveChangesAsync();

            // Act
            var response = await _client.GetAsync($"/api/Tasks?dueBefore={DateTime.UtcNow:yyyy-MM-dd}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().Contain(t => t.Title == "Задача в прошлом");
            tasks.Should().NotContain(t => t.Title == "Задача в будущем");
        }

        [Fact]
        public async Task GetTasks_WithDueAfterFilter_ReturnsTasksAfterDate()
        {
            // Arrange
            var futureDate = DateTime.UtcNow.AddDays(10);
            var pastDate = DateTime.UtcNow.AddDays(-5);
            
            using var scope = _factory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            
            var task1 = new TaskItem
            {
                Title = "Задача в прошлом",
                DueDate = pastDate,
                Status = TaskItemStatus.New,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            var task2 = new TaskItem
            {
                Title = "Задача в будущем",
                DueDate = futureDate,
                Status = TaskItemStatus.New,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            dbContext.Tasks.AddRange(task1, task2);
            await dbContext.SaveChangesAsync();

            // Act
            var response = await _client.GetAsync($"/api/Tasks?dueAfter={DateTime.UtcNow:yyyy-MM-dd}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().NotContain(t => t.Title == "Задача в прошлом");
            tasks.Should().Contain(t => t.Title == "Задача в будущем");
        }

        [Fact]
        public async Task GetTasks_WithDateRangeFilter_ReturnsTasksInRange()
        {
            // Arrange
            var date1 = DateTime.UtcNow.AddDays(-10);
            var date2 = DateTime.UtcNow.AddDays(-5);
            var date3 = DateTime.UtcNow.AddDays(5);
            
            using var scope = _factory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            
            var task1 = new TaskItem
            {
                Title = "Задача 1",
                DueDate = date1,
                Status = TaskItemStatus.New,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            var task2 = new TaskItem
            {
                Title = "Задача 2",
                DueDate = date2,
                Status = TaskItemStatus.New,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            var task3 = new TaskItem
            {
                Title = "Задача 3",
                DueDate = date3,
                Status = TaskItemStatus.New,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            dbContext.Tasks.AddRange(task1, task2, task3);
            await dbContext.SaveChangesAsync();

            // Act - фильтр по диапазону
            var dueAfter = DateTime.UtcNow.AddDays(-12);
            var dueBefore = DateTime.UtcNow.AddDays(-3);
            var response = await _client.GetAsync($"/api/Tasks?dueAfter={dueAfter:yyyy-MM-dd}&dueBefore={dueBefore:yyyy-MM-dd}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().Contain(t => t.Title == "Задача 1");
            tasks.Should().Contain(t => t.Title == "Задача 2");
            tasks.Should().NotContain(t => t.Title == "Задача 3");
        }

        [Fact]
        public async Task GetTasks_WithCombinedFilters_ReturnsMatchingTasks()
        {
            // Arrange
            using var scope = _factory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            
            var user2 = new User { Name = "Второй пользователь", Email = "user2@test.com" };
            dbContext.Users.Add(user2);
            dbContext.WorkspaceMembers.Add(new WorkspaceMember
            {
                WorkspaceId = TestWorkspaceId,
                UserId = user2.Id,
                Role = WorkspaceRole.Member,
                AddedAt = DateTime.UtcNow
            });
            await dbContext.SaveChangesAsync();

            var task1 = new TaskItem
            {
                Title = "New задача User 1",
                DueDate = DateTime.UtcNow.AddDays(5),
                Status = TaskItemStatus.New,
                AssigneeId = TestUserId,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            var task2 = new TaskItem
            {
                Title = "Done задача User 1",
                DueDate = DateTime.UtcNow.AddDays(5),
                Status = TaskItemStatus.Done,
                AssigneeId = TestUserId,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            var task3 = new TaskItem
            {
                Title = "New задача User 2",
                DueDate = DateTime.UtcNow.AddDays(5),
                Status = TaskItemStatus.New,
                AssigneeId = user2.Id,
                WorkspaceId = TestWorkspaceId,
                CreatedAt = DateTime.UtcNow
            };
            dbContext.Tasks.AddRange(task1, task2, task3);
            await dbContext.SaveChangesAsync();

            // Act - комбинация: статус New + assignee User 1
            var response = await _client.GetAsync($"/api/Tasks?status=New&assigneeId={TestUserId}");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().Contain(t => t.Title == "New задача User 1");
            tasks.Should().NotContain(t => t.Title == "Done задача User 1");
            tasks.Should().NotContain(t => t.Title == "New задача User 2");
        }

        [Fact]
        public async Task GetTasks_WithNoFilters_ReturnsAllTasks()
        {
            // Arrange
            await CreateTaskAsync("Задача 1", TaskItemStatus.New);
            await CreateTaskAsync("Задача 2", TaskItemStatus.InProgress);
            await CreateTaskAsync("Задача 3", TaskItemStatus.Done);

            // Act
            var response = await _client.GetAsync("/api/Tasks");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().NotBeNull();
            tasks.Count.Should().BeGreaterOrEqualTo(3);
        }

        [Fact]
        public async Task GetTasks_WithNonExistingFilterValues_ReturnsEmptyList()
        {
            // Act
            var response = await _client.GetAsync("/api/Tasks?status=999&assigneeId=99999");
            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var tasks = await response.Content.ReadFromJsonAsync<List<TaskDto>>();

            // Assert
            tasks.Should().NotBeNull();
            tasks.Should().BeEmpty();
        }

        // Вспомогательный метод
        private async Task<TaskDto> CreateTaskAsync(string title, TaskItemStatus status, int? assigneeId = null)
        {
            var newTask = TestDataFactory.CreateValidTask(assigneeId ?? TestUserId);
            newTask.Title = title;
            
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", newTask);
            createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
            var createdTask = await createResponse.Content.ReadFromJsonAsync<TaskDto>();

            if (status != TaskItemStatus.New)
            {
                var updateDto = new UpdateTaskDto
                {
                    Id = createdTask!.Id,
                    Title = createdTask.Title,
                    Description = createdTask.Description,
                    Status = status,
                    AssigneeId = createdTask.AssigneeId,
                    DueDate = createdTask.DueDate,
                    Priority = createdTask.Priority,
                    TagIds = createdTask.TagIds
                };
                await _client.PutAsJsonAsync($"/api/Tasks/{createdTask.Id}", updateDto);
            }

            return createdTask!;
        }
    }
}
