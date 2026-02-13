using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestPlatform.TestHost;
using System.Net;
using System.Net.Http.Json;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;
using TaskManager.Tests.Helpers;

namespace TaskManager.Tests.IntegrationTests;

public class ReportsApiTests : TestBase
{
    public ReportsApiTests(WebApplicationFactory<Program> factory) : base(factory) { }

    [Fact]
    public async Task GetStatusSummary_ReturnsOkWithCounts()
    {
        // 1. Создаём задачу со статусом New (по умолчанию)
        var newTask = TestDataFactory.CreateValidTask();
        var newResponse = await _client.PostAsJsonAsync("/api/Tasks", newTask);
        newResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var createdNew = await newResponse.Content.ReadFromJsonAsync<TaskDto>();

        // 2. Создаём задачу, затем обновляем её статус на InProgress
        var inProgressTask = TestDataFactory.CreateValidTask();
        var ipResponse = await _client.PostAsJsonAsync("/api/Tasks", inProgressTask);
        var createdIp = await ipResponse.Content.ReadFromJsonAsync<TaskDto>();
        var updateIp = new UpdateTaskDto
        {
            Id = createdIp!.Id,
            Title = createdIp.Title,
            Description = createdIp.Description,
            AssigneeId = createdIp.AssigneeId,
            DueDate = createdIp.DueDate,
            Status = TaskItemStatus.InProgress,
            Priority = createdIp.Priority,
            TagIds = createdIp.TagIds
        };
        await _client.PutAsJsonAsync($"/api/Tasks/{createdIp.Id}", updateIp);

        // 3. Создаём задачу, затем обновляем её статус на Done
        var doneTask = TestDataFactory.CreateValidTask();
        var doneResponse = await _client.PostAsJsonAsync("/api/Tasks", doneTask);
        var createdDone = await doneResponse.Content.ReadFromJsonAsync<TaskDto>();
        var updateDone = new UpdateTaskDto
        {
            Id = createdDone!.Id,
            Title = createdDone.Title,
            Description = createdDone.Description,
            AssigneeId = createdDone.AssigneeId,
            DueDate = createdDone.DueDate,
            Status = TaskItemStatus.Done,
            Priority = createdDone.Priority,
            TagIds = createdDone.TagIds
        };
        await _client.PutAsJsonAsync($"/api/Tasks/{createdDone.Id}", updateDone);

        // Act
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
        // Создаем просроченную задачу напрямую через DbContext, минуя API валидацию
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        
        var user = dbContext.Users.First();
        var overdueTask = new TaskItem
        {
            Title = "Просроченная задача для теста",
            Description = "Создано напрямую в БД",
            AssigneeId = user.Id,
            DueDate = DateTime.UtcNow.AddDays(-5), // Просроченная дата
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
        var task = TestDataFactory.CreateValidTask();
        var createResponse = await _client.PostAsJsonAsync("/api/Tasks", task);
        var created = await createResponse.Content.ReadFromJsonAsync<TaskDto>();

        var doneTask = new UpdateTaskDto
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
        await _client.PutAsJsonAsync($"/api/Tasks/{created.Id}", doneTask);

        var response = await _client.GetAsync("/api/Reports/avg-completion-time");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<AverageCompletionTimeDto>();
        result.Should().NotBeNull();
        result!.AverageDays.Should().BeGreaterThanOrEqualTo(0);
        result.SampleSize.Should().BeGreaterThanOrEqualTo(1);
    }
}