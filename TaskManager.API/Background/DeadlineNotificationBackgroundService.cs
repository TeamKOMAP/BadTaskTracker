using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using TaskManager.Infrastructure.Data;

namespace TaskManager.API.Background
{
    public class DeadlineNotificationBackgroundService : BackgroundService
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<DeadlineNotificationBackgroundService> _logger;

        public DeadlineNotificationBackgroundService(
            IServiceProvider services,
            ILogger<DeadlineNotificationBackgroundService> logger)
        {
            _services = services;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Сервис уведомлений о дедлайнах запущен");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var now = DateTime.Now;
                    var nextRun = now.Date.AddDays(1).AddHours(9);

                    if (now.Hour >= 9)
                    {
                        using (var scope = _services.CreateScope())
                        {
                            var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                            var emailSender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
                            var notificationRepo = scope.ServiceProvider.GetRequiredService<INotificationRepository>();

                            await CheckDeadlinesAsync(dbContext, emailSender, notificationRepo);
                        }
                        nextRun = now.Date.AddDays(1).AddHours(9);
                    }

                    var delay = nextRun - now;
                    if (delay < TimeSpan.Zero)
                        delay = TimeSpan.FromHours(1);

                    await Task.Delay(delay, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Ошибка в сервисе уведомлений");
                    await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
                }
            }
        }

        private async Task CheckDeadlinesAsync(
            ApplicationDbContext dbContext,
            IEmailSender emailSender,
            INotificationRepository notificationRepo)
        {
            var today = DateTime.UtcNow.Date;
            var tomorrow = today.AddDays(1);
            var dayAfterTomorrow = today.AddDays(2);

            var tasksDueSoon = await dbContext.Tasks
                .Include(t => t.Assignee)
                .Where(t => t.DueDate.Date >= today
                    && t.DueDate.Date < dayAfterTomorrow
                    && t.Status != TaskItemStatus.Done
                    && t.Assignee != null
                    && !t.DeadlineNotificationSent)
                .ToListAsync();

            if (!tasksDueSoon.Any())
            {
                _logger.LogInformation("Нет задач для уведомлений");
                return;
            }

            foreach (var task in tasksDueSoon)
            {
                var isToday = task.DueDate.Date == today;
                var hoursLeft = (int)(task.DueDate - DateTime.UtcNow).TotalHours;

                // 1. Отправляем email
                if (task.Assignee?.Email != null)
                {
                    string subject = isToday
                        ? $"СРОЧНО: Задача '{task.Title}' истекает сегодня"
                        : $"Напоминание: Задача '{task.Title}' истекает завтра";

                    string emailBody = $"Задача: {task.Title}\n" +
                                      $"Дедлайн: {task.DueDate:dd.MM.yyyy HH:mm}\n" +
                                      $"Осталось: {hoursLeft} часов\n" +
                                      $"Приоритет: {task.Priority}";

                    await emailSender.SendAsync(task.Assignee.Email, subject, emailBody);
                }

                // 2. Сохраняем уведомление в БД
                var notification = new Notification
                {
                    UserId = task.Assignee!.Id,
                    Type = "deadline",
                    Title = isToday ? "⚠️ Дедлайн сегодня" : "⏰ Дедлайн завтра",
                    Message = $"Задача '{task.Title}' истекает {(isToday ? "сегодня" : "завтра")} в {task.DueDate:HH:mm}",
                    TaskId = task.Id,
                    IsRead = false
                };

                await notificationRepo.AddAsync(notification);

                // 3. Помечаем, что уведомление отправлено
                task.DeadlineNotificationSent = true;
                task.DeadlineNotificationSentAt = DateTime.UtcNow;
            }

            await dbContext.SaveChangesAsync();
            _logger.LogInformation("Отправлено {Count} уведомлений о дедлайнах", tasksDueSoon.Count);
        }
    }
}