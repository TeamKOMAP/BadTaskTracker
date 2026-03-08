using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
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
    [Trait("Category", "Reports")]
    public class ReportsApiTests : TestBase
    {
        public ReportsApiTests(WebApplicationFactory<Program> factory) : base(factory) { }

        [Fact]
        public async Task GetStatusSummary_ReturnsOkWithCounts()
        {
            // Создаем задачи в разных статусах
            var newTask = TestDataFactory.CreateValidTask(TestUserId);
            await _client.PostAsJsonAsync("/api/Tasks", newTask);

            var inProgressTask = TestDataFactory.CreateValidTask(TestUserId);
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", inProgressTask);
            var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();
            
            await _client.PutAsJsonAsync($"/api/Tasks/{created!.Id}", new UpdateTaskDto
            {
                Id = created.Id,
                Title = created.Title,
                Status = TaskItemStatus.InProgress,
                AssigneeId = created.AssigneeId,
                DueDate = created.DueDate,
                Priority = created.Priority,
                TagIds = created.TagIds
            });

            var doneTask = TestDataFactory.CreateValidTask(TestUserId);
            createResponse = await _client.PostAsJsonAsync("/api/Tasks", doneTask);
            created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();
            
            await _client.PutAsJsonAsync($"/api/Tasks/{created!.Id}", new UpdateTaskDto
            {
                Id = created.Id,
                Title = created.Title,
                Status = TaskItemStatus.Done,
                AssigneeId = created.AssigneeId,
                DueDate = created.DueDate,
                Priority = created.Priority,
                TagIds = created.TagIds
            });

            var response = await _client.GetAsync("/api/Reports/status-summary");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var summary = await response.Content.ReadFromJsonAsync<StatusSummaryDto>();
            summary.Should().NotBeNull();
            summary!.New.Should().BeGreaterThanOrEqualTo(1);
            summary.InProgress.Should().BeGreaterThanOrEqualTo(1);
            summary.Done.Should().BeGreaterThanOrEqualTo(1);
            summary.Total.Should().Be(summary.New + summary.InProgress + summary.Done + summary.Overdue);
        }

        [Fact]
        public async Task GetOverdueByAssignee_ReturnsOk()
        {
            // Создаем просроченную задачу напрямую через DbContext
            using var scope = _factory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            
            var overdueTask = new TaskItem
            {
                Title = "Просроченная задача для теста",
                Description = "Создано напрямую в БД",
                AssigneeId = TestUserId,
                WorkspaceId = TestWorkspaceId,
                DueDate = DateTime.UtcNow.AddDays(-5),
                Status = TaskItemStatus.New,
                Priority = TaskPriority.High,
                CreatedAt = DateTime.UtcNow.AddDays(-10)
            };
            
            dbContext.Tasks.Add(overdueTask);
            await dbContext.SaveChangesAsync();

            var response = await _client.GetAsync("/api/Reports/overdue-by-assignee");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var report = await response.Content.ReadFromJsonAsync<List<OverdueByAssigneeDto>>();
            report.Should().NotBeNull();
            report.Should().HaveCountGreaterThanOrEqualTo(1);
            report!.First().OverdueCount.Should().BeGreaterThanOrEqualTo(1);
        }

        [Fact]
        public async Task GetAvgCompletionTime_WithCompletedTasks_ReturnsNumber()
        {
            // Создаем и выполняем задачу
            var newTask = TestDataFactory.CreateValidTask(TestUserId);
            var createResponse = await _client.PostAsJsonAsync("/api/Tasks", newTask);
            var createdTask = await createResponse.Content.ReadFromJsonAsync<TaskDto>();

            await _client.PutAsJsonAsync($"/api/Tasks/{createdTask!.Id}", new UpdateTaskDto
            {
                Id = createdTask.Id,
                Title = createdTask.Title,
                Status = TaskItemStatus.Done,
                AssigneeId = createdTask.AssigneeId,
                DueDate = createdTask.DueDate,
                Priority = createdTask.Priority,
                TagIds = createdTask.TagIds
            });

            var response = await _client.GetAsync("/api/Reports/avg-completion-time");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var result = await response.Content.ReadFromJsonAsync<AverageCompletionTimeDto>();
            result.Should().NotBeNull();
            result!.SampleSize.Should().BeGreaterThanOrEqualTo(1);
            // среднее время выполнения может быть 0, если задача создана и сразу завершена
        }

        [Fact]
        public async Task GetAvgCompletionTime_NoCompletedTasks_ReturnsZero()
        {
            // Очищаем все выполненные задачи напрямую через БД
            using var scope = _factory.Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var completedTasks = dbContext.Tasks.Where(t => t.Status == TaskItemStatus.Done).ToList();
            dbContext.Tasks.RemoveRange(completedTasks);
            await dbContext.SaveChangesAsync();

            var response = await _client.GetAsync("/api/Reports/avg-completion-time");
            response.StatusCode.Should().Be(HttpStatusCode.OK);

            var result = await response.Content.ReadFromJsonAsync<AverageCompletionTimeDto>();
            result!.SampleSize.Should().Be(0);
            result.AverageHours.Should().Be(0);
        }
    }
}
