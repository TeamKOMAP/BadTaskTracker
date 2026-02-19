using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;
using TimeZoneConverter;

namespace TaskManager.API.Background
{
    /// <summary>
    /// Background service for sending deadline notifications to task assignees.
    /// </summary>
    public class DeadlineNotificationBackgroundService : BackgroundService
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<DeadlineNotificationBackgroundService> _logger;

        /// <summary>
        /// Initializes a new instance of the DeadlineNotificationBackgroundService.
        /// </summary>
        /// <param name="services">The service provider for creating scopes.</param>
        /// <param name="logger">The logger.</param>
        public DeadlineNotificationBackgroundService(
            IServiceProvider services,
            ILogger<DeadlineNotificationBackgroundService> logger)
        {
            _services = services;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Deadline notification service started");

            DateTime? lastRunDateUtc = null;

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var nowUtc = DateTime.UtcNow;
                    var runTodayAtUtc = nowUtc.Date.AddHours(9);

                    if (nowUtc >= runTodayAtUtc && lastRunDateUtc != nowUtc.Date)
                    {
                        using (var scope = _services.CreateScope())
                        {
                            var taskRepository = scope.ServiceProvider.GetRequiredService<ITaskRepository>();
                            var emailSender = scope.ServiceProvider.GetRequiredService<IEmailSender>();
                            var notificationRepo = scope.ServiceProvider.GetRequiredService<INotificationRepository>();

                            await CheckDeadlinesAsync(taskRepository, emailSender, notificationRepo, stoppingToken);
                        }

                        lastRunDateUtc = nowUtc.Date;
                    }

                    var nextRunUtc = nowUtc < runTodayAtUtc
                        ? runTodayAtUtc
                        : nowUtc.Date.AddDays(1).AddHours(9);

                    var delay = nextRunUtc - nowUtc;
                    if (delay < TimeSpan.Zero)
                        delay = TimeSpan.FromMinutes(1);

                    await Task.Delay(delay, stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in deadline notification service");
                    await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
                }
            }
        }

        private async Task CheckDeadlinesAsync(
            ITaskRepository taskRepository,
            IEmailSender emailSender,
            INotificationRepository notificationRepo,
            CancellationToken cancellationToken)
        {
            var nowUtc = DateTime.UtcNow;
            var rangeStartUtc = nowUtc.Date.AddDays(-1);
            var rangeEndUtc = nowUtc.Date.AddDays(3);

            var tasksDueSoon = await taskRepository.GetTasksForDeadlineNotificationAsync(
                rangeStartUtc,
                rangeEndUtc,
                cancellationToken);

            var taskList = tasksDueSoon.ToList();
            if (!taskList.Any())
            {
                _logger.LogInformation("No tasks for deadline notifications");
                return;
            }

            var notificationsToCreate = new List<Notification>(taskList.Count);
            var notifiedTaskIds = new List<int>(taskList.Count);

            foreach (var task in taskList)
            {
                var dueUtc = NormalizeUtc(task.DueDate);
                var userTimeZone = ResolveTimeZone(task.Assignee?.TimeZoneId);
                var dueLocal = TimeZoneInfo.ConvertTimeFromUtc(dueUtc, userTimeZone);
                var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, userTimeZone);

                var isToday = dueLocal.Date == nowLocal.Date;
                var isTomorrow = dueLocal.Date == nowLocal.Date.AddDays(1);
                if (!isToday && !isTomorrow)
                {
                    continue;
                }

                var hoursLeft = (int)Math.Max(0, Math.Ceiling((dueUtc - nowUtc).TotalHours));

                // 1. Send email
                if (task.Assignee?.Email != null)
                {
                    string subject = isToday
                        ? $"СРОЧНО: Задача '{task.Title}' истекает сегодня"
                        : $"Напоминание: Задача '{task.Title}' истекает завтра";

                    string emailBody = $"Задача: {task.Title}\n" +
                                      $"Дедлайн: {dueLocal:dd.MM.yyyy HH:mm}\n" +
                                      $"Осталось: {hoursLeft} часов\n" +
                                      $"Приоритет: {task.Priority}";

                    await emailSender.SendAsync(task.Assignee.Email, subject, emailBody);
                }

                // 2. Create notification
                var notification = new Notification
                {
                    UserId = task.Assignee!.Id,
                    Type = "deadline_soon",
                    Title = isToday ? "⚠️ Дедлайн сегодня" : "⏰ Дедлайн завтра",
                    Message = $"Задача '{task.Title}' истекает {(isToday ? "сегодня" : "завтра")} в {dueLocal:HH:mm}",
                    TaskId = task.Id,
                    WorkspaceId = task.WorkspaceId,
                    ActionUrl = $"workspace.html?workspaceId={task.WorkspaceId}",
                    IsRead = false
                };

                notificationsToCreate.Add(notification);
                notifiedTaskIds.Add(task.Id);
            }

            if (notificationsToCreate.Count == 0)
            {
                _logger.LogInformation("No tasks for notifications in user timezones");
                return;
            }

            // 3. Save notifications
            await notificationRepo.AddRangeAsync(notificationsToCreate, cancellationToken, saveChanges: false);
            await notificationRepo.SaveChangesAsync(cancellationToken);

            // 4. Mark tasks as notified
            await taskRepository.MarkDeadlineNotificationsSentAsync(notifiedTaskIds, cancellationToken);

            _logger.LogInformation("Sent {Count} deadline notifications", notificationsToCreate.Count);
        }

        private static DateTime NormalizeUtc(DateTime value)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
            };
        }

        private static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
        {
            var raw = (timeZoneId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(raw))
            {
                return TimeZoneInfo.Utc;
            }

            try
            {
                return TZConvert.GetTimeZoneInfo(raw);
            }
            catch
            {
                return TimeZoneInfo.Utc;
            }
        }
    }
}
