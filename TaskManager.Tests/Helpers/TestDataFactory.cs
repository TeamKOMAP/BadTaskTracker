using TaskManager.Application.DTOs;
using TaskManager.Domain.Enums;

namespace TaskManager.Tests.Helpers
{
    public static class TestDataFactory
    {
        public static CreateTaskDto CreateValidTask(int assigneeId = 1)
        {
            return new CreateTaskDto
            {
                Title = $"Тестовая задача {Guid.NewGuid()}",
                Description = "Описание тестовой задачи",
                AssigneeId = assigneeId,
                DueDate = DateTime.UtcNow.AddDays(7),
                Priority = TaskPriority.Medium,
                TagIds = new List<int> { 1 }
            };
        }

        public static CreateTaskDto CreateTaskWithoutTitle()
        {
            return new CreateTaskDto
            {
                Title = "",
                Description = "Описание без заголовка",
                DueDate = DateTime.UtcNow.AddDays(7),
                Priority = TaskPriority.Low
            };
        }

        public static CreateTaskDto CreateTaskWithPastDueDate(int assigneeId = 1)
        {
            return new CreateTaskDto
            {
                Title = $"Задача с прошедшим сроком {Guid.NewGuid()}",
                Description = "Эта задача не должна создаваться",
                AssigneeId = assigneeId,
                DueDate = DateTime.UtcNow.AddDays(-1),
                Priority = TaskPriority.High,
                TagIds = new List<int> { 1 }
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
}
