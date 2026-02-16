namespace TaskManager.Application.DTOs
{
    public class TaskAttachmentDto
    {
        public string Id { get; set; } = string.Empty;
        public int TaskId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = "application/octet-stream";
        public long Size { get; set; }
        public DateTime UploadedAtUtc { get; set; }
        public string DownloadUrl { get; set; } = string.Empty;
    }
}
