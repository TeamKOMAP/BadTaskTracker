namespace TaskManager.Application.DTOs
{
    public class DashboardDto
    {
        // Основные метрики
        public int TotalTasks { get; set; }
        public int CompletedTasks { get; set; }
        public int InProgressTasks { get; set; }
        public int OverdueTasks { get; set; }
        public int TasksDueToday { get; set; }
        public int TasksDueTomorrow { get; set; }
        public int TasksDueThisWeek { get; set; }

        // Проценты
        public double CompletionRate { get; set; }
        public double OnTimeRate { get; set; }

        // Графики
        public Dictionary<string, int> TasksByStatus { get; set; } = new();
        public Dictionary<string, int> TasksByPriority { get; set; } = new();
        public Dictionary<string, int> TasksByDay { get; set; } = new(); // для графика
        public Dictionary<string, int> TasksByAssignee { get; set; } = new();

        // Активность
        public List<RecentActivityDto> RecentActivities { get; set; } = new();

        // Топ исполнители
        public List<UserTaskCountDto> TopPerformers { get; set; } = new();
    }

    public class RecentActivityDto
    {
        public int TaskId { get; set; }
        public string TaskTitle { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
    }

    public class UserTaskCountDto
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public int CompletedCount { get; set; }
    }
}