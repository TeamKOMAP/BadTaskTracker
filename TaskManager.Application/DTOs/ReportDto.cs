namespace TaskManager.Application.DTOs
{
    public class StatusSummaryDto
    {
        public int New { get; set; }
        public int InProgress { get; set; }
        public int Done { get; set; }
        public int Overdue { get; set; }
        public int Total { get; set; }
    }

    public class OverdueByAssigneeDto
    {
        public int AssigneeId { get; set; }
        public string AssigneeName { get; set; } = string.Empty;
        public int OverdueCount { get; set; }
        public List<OverdueTaskDto> Tasks { get; set; } = new();
    }

    public class OverdueTaskDto
    {
        public int TaskId { get; set; }
        public string Title { get; set; } = string.Empty;
        public DateTime DueDate { get; set; }
        public int DaysOverdue { get; set; }
    }

    public class AverageCompletionTimeDto
    {
        public double AverageDays { get; set; }
        public double AverageHours { get; set; }
        public int SampleSize { get; set; }
    }

    public class OverdueTaskAssigneeRowDto
    {
        public int? AssigneeId { get; set; }
        public string? AssigneeName { get; set; }
        public int TaskId { get; set; }
        public string Title { get; set; } = string.Empty;
        public DateTime DueDate { get; set; }
    }
}
