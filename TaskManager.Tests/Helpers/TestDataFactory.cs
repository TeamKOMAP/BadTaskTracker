using TaskManager.Application.DTOs;
using TaskManager.Domain.Enums;

namespace TaskManager.Tests.Helpers;

public static class TestDataFactory
{
    public static CreateTaskDto CreateValidTask(int assigneeId = 1, TaskPriority priority = TaskPriority.Medium)
    {
        return new CreateTaskDto
        {
            Title = $"Тестовая задача {Guid.NewGuid()}",
            Description = "Создано фабрикой тестовых данных",
            AssigneeId = assigneeId,
            DueDate = DateTime.UtcNow.AddDays(7),
            Priority = priority,
            TagIds = new List<int> { 1 }
        };
    }

    public static CreateUserDto CreateValidUser()
    {
        return new CreateUserDto
        {
            Name = $"Тестовый Пользователь {Guid.NewGuid()}",
            Email = $"user{Guid.NewGuid()}@example.com"
        };
    }

    public static CreateTagDto CreateValidTag()
    {
        return new CreateTagDto
        {
            Name = $"test-tag-{Guid.NewGuid()}",
            Color = "#007bff"
        };
    }
}