using TaskManager.Domain.Enums;

namespace TaskManager.Application.DTOs
{
    public class TaskQueryDto
    {
        // Пагинация
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 20;

        // Сортировка
        public string? SortBy { get; set; } = "dueDate";
        public string SortOrder { get; set; } = "asc";

        // Поиск
        public string? Search { get; set; }

        // Фильтры 
        public int? AssigneeId { get; set; }
        public TaskItemStatus? Status { get; set; }        // был string, теперь TaskItemStatus?
        public TaskPriority? Priority { get; set; }       //
        public DateTime? DueDateFrom { get; set; }
        public DateTime? DueDateTo { get; set; }
        public List<int>? TagIds { get; set; }            
    }

    public class PaginatedResult<T>
    {
        public List<T> Items { get; set; } = new();
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalPages => (int)Math.Ceiling((double)TotalCount / PageSize);
        public bool HasPrevious => Page > 1;
        public bool HasNext => Page < TotalPages;
    }
}