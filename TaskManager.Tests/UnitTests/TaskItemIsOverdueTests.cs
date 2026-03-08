using FluentAssertions;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using Xunit;

namespace TaskManager.Tests.UnitTests
{
    [Trait("Category", "Unit")]
    public class TaskItemIsOverdueTests
    {
        [Fact]
        public void IsOverdue_DueDateInPastAndStatusNotDone_ReturnsTrue()
        {
            // подготовка
            var task = new TaskItem
            {
                Title = "Просроченная задача",
                DueDate = DateTime.UtcNow.AddDays(-5),
                Status = TaskItemStatus.New,
                CreatedAt = DateTime.UtcNow.AddDays(-10)
            };

            // действие и проверка
            task.IsOverdue.Should().BeTrue();
        }

        [Fact]
        public void IsOverdue_DueDateInFutureAndStatusNotDone_ReturnsFalse()
        {
            // подготовка
            var task = new TaskItem
            {
                Title = "Актуальная задача",
                DueDate = DateTime.UtcNow.AddDays(5),
                Status = TaskItemStatus.New,
                CreatedAt = DateTime.UtcNow
            };

            // действие и проверка
            task.IsOverdue.Should().BeFalse();
        }

        [Fact]
        public void IsOverdue_StatusDoneAndDueDateInPast_ReturnsFalse()
        {
            // подготовка
            var task = new TaskItem
            {
                Title = "Выполненная задача",
                DueDate = DateTime.UtcNow.AddDays(-5),
                Status = TaskItemStatus.Done,
                CreatedAt = DateTime.UtcNow.AddDays(-10),
                CompletedAt = DateTime.UtcNow.AddDays(-3)
            };

            // действие и проверка
            task.IsOverdue.Should().BeFalse();
        }

        [Fact]
        public void IsOverdue_StatusDoneAndDueDateInFuture_ReturnsFalse()
        {
            // подготовка
            var task = new TaskItem
            {
                Title = "Выполненная задача",
                DueDate = DateTime.UtcNow.AddDays(5),
                Status = TaskItemStatus.Done,
                CreatedAt = DateTime.UtcNow.AddDays(-2),
                CompletedAt = DateTime.UtcNow
            };

            // действие и проверка
            task.IsOverdue.Should().BeFalse();
        }

        [Fact]
        public void IsOverdue_DueDateOneSecondAgo_ReturnsTrue()
        {
            // подготовка
            var task = new TaskItem
            {
                Title = "Задача просрочена на секунду",
                DueDate = DateTime.UtcNow.AddSeconds(-1),
                Status = TaskItemStatus.InProgress,
                CreatedAt = DateTime.UtcNow.AddDays(-1)
            };

            // действие и проверка
            task.IsOverdue.Should().BeTrue();
        }

        [Fact]
        public void IsOverdue_DueDateOneSecondInFuture_ReturnsFalse()
        {
            // подготовка
            var task = new TaskItem
            {
                Title = "Задача срок через секунду",
                DueDate = DateTime.UtcNow.AddSeconds(1),
                Status = TaskItemStatus.New,
                CreatedAt = DateTime.UtcNow.AddDays(-1)
            };

            // действие и проверка
            task.IsOverdue.Should().BeFalse();
        }

        [Theory]
        [InlineData(TaskItemStatus.New, true)]
        [InlineData(TaskItemStatus.InProgress, true)]
        [InlineData(TaskItemStatus.Done, false)]
        public void IsOverdue_VariousStatusesWithPastDueDate_ReturnsExpectedResult(TaskItemStatus status, bool expectedOverdue)
        {
            // подготовка
            var task = new TaskItem
            {
                Title = "Тестовая задача",
                DueDate = DateTime.UtcNow.AddDays(-1),
                Status = status,
                CreatedAt = DateTime.UtcNow.AddDays(-5)
            };

            if (status == TaskItemStatus.Done)
            {
                task.CompletedAt = DateTime.UtcNow.AddHours(-1);
            }

            // действие и проверка
            task.IsOverdue.Should().Be(expectedOverdue);
        }
    }
}
