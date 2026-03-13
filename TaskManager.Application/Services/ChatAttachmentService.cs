using Microsoft.AspNetCore.Http;

namespace TaskManager.Application.Services;

public interface IChatAttachmentService
{
    Task<ChatMessageAttachmentDto> UploadAsync(Guid chatId, long messageId, int userId, IFormFile file, CancellationToken ct = default);
    Task<IReadOnlyList<ChatMessageAttachmentDto>> GetByMessageAsync(Guid chatId, long messageId, int userId, CancellationToken ct = default);
    Task<(Stream Content, string FileName, string ContentType)> DownloadAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default);
    Task DeleteAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default);
}

public class ChatMessageAttachmentDto
{
    public Guid Id { get; set; }
    public long MessageId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public int? DurationMs { get; set; }
}
