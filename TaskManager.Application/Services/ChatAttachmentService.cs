using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using ChatSettings = TaskManager.Chat.Application.Configuration.ChatSettings;

namespace TaskManager.Application.Services;

public interface IChatAttachmentService
{
    Task<ChatMessageAttachmentDto> UploadAsync(Guid chatId, int userId, IFormFile file, CancellationToken ct = default);
    Task<(Stream Content, string FileName, string ContentType)> DownloadAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default);
    Task DeleteAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default);
}

public class ChatAttachmentService : IChatAttachmentService
{
    private readonly IChatRepository _chatRepository;
    private readonly IChatMessageAttachmentRepository _attachmentRepository;
    private readonly IChatRoomMemberRepository _memberRepository;
    private readonly IObjectStorage _objectStorage;
    private readonly ChatSettings _chatSettings;

    private static readonly HashSet<string> AllowedImageMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/gif", "image/webp"
    };

    private static readonly HashSet<string> AllowedFileMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain", "text/csv"
    };

    private const long MaxFileSize = 50 * 1024 * 1024; // 50MB
    private const long MaxVoiceSize = 10 * 1024 * 1024; // 10MB
    private const long MaxImageSize = 10 * 1024 * 1024; // 10MB

    public ChatAttachmentService(
        IChatRepository chatRepository,
        IChatMessageAttachmentRepository attachmentRepository,
        IChatRoomMemberRepository memberRepository,
        IObjectStorage objectStorage,
        ChatSettings chatSettings)
    {
        _chatRepository = chatRepository;
        _attachmentRepository = attachmentRepository;
        _memberRepository = memberRepository;
        _objectStorage = objectStorage;
        _chatSettings = chatSettings;
    }

    public async Task<ChatMessageAttachmentDto> UploadAsync(Guid chatId, int userId, IFormFile file, CancellationToken ct = default)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        ValidateFile(file);

        var isVoice = IsVoiceMessage(file.FileName, file.ContentType);
        var isImage = AllowedImageMimeTypes.Contains(file.ContentType);

        var maxSize = isVoice ? MaxVoiceSize : (isImage ? MaxImageSize : MaxFileSize);
        if (file.Length > maxSize)
        {
            throw new ValidationException($"File size exceeds maximum allowed size of {maxSize / 1024 / 1024}MB");
        }

        var objectKey = GenerateObjectKey(chatId, file.FileName, isVoice);
        var validatedContent = await ValidateAndSanitizeFileAsync(file, isImage);

        await _objectStorage.UploadAsync("gtt-private", objectKey, validatedContent, file.ContentType);

        var attachment = new ChatMessageAttachment
        {
            Id = Guid.NewGuid(),
            ObjectKey = objectKey,
            FileName = SanitizeFileName(file.FileName),
            ContentType = file.ContentType,
            Size = file.Length,
            DurationMs = null
        };

        await _attachmentRepository.AddAsync(attachment, ct);

        return new ChatMessageAttachmentDto
        {
            Id = attachment.Id,
            FileName = attachment.FileName,
            ContentType = attachment.ContentType,
            Size = attachment.Size,
            DurationMs = attachment.DurationMs
        };
    }

    public async Task<(Stream Content, string FileName, string ContentType)> DownloadAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default)
    {
        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        var attachment = await _attachmentRepository.GetByIdAsync(attachmentId, ct)
            ?? throw new NotFoundException("Attachment not found");

        var stream = await _objectStorage.OpenReadAsync("gtt-private", attachment.ObjectKey);

        return (stream, attachment.FileName, attachment.ContentType);
    }

    public async Task DeleteAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default)
    {
        var attachment = await _attachmentRepository.GetByIdAsync(attachmentId, ct)
            ?? throw new NotFoundException("Attachment not found");

        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        await _objectStorage.DeleteAsync("gtt-private", attachment.ObjectKey);
        await _attachmentRepository.DeleteAsync(attachmentId, ct);
    }

    private void ValidateFile(IFormFile file)
    {
        if (file.Length == 0)
        {
            throw new ValidationException("File is empty");
        }

        var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        if (extension == ".exe" || extension == ".bat" || extension == ".cmd" || extension == ".sh")
        {
            throw new ValidationException("Executable files are not allowed");
        }
    }

    private async Task<Stream> ValidateAndSanitizeFileAsync(IFormFile file, bool isImage)
    {
        using var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream);
        memoryStream.Position = 0;

        if (isImage)
        {
            return ValidateImage(memoryStream);
        }

        return ValidateFileMagicBytes(memoryStream, file.ContentType);
    }

    private Stream ValidateImage(Stream stream)
    {
        stream.Position = 0;
        var header = new byte[8];
        stream.Read(header, 0, 8);
        stream.Position = 0;

        if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            return stream;
        }
        if (header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47)
        {
            return stream;
        }
        if (header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46)
        {
            return stream;
        }
        if (header[0] == 0x52 && header[1] == 0x49 && header[2] == 0x46 && header[3] == 0x46)
        {
            return stream;
        }

        throw new ValidationException("Invalid image format");
    }

    private Stream ValidateFileMagicBytes(Stream stream, string contentType)
    {
        stream.Position = 0;
        var header = new byte[4];
        stream.Read(header, 0, 4);
        stream.Position = 0;

        if (contentType == "application/pdf" && (header[0] != 0x25 || header[1] != 0x50))
        {
            throw new ValidationException("Invalid PDF file");
        }

        return stream;
    }

    private static bool IsVoiceMessage(string fileName, string contentType)
    {
        var extension = Path.GetExtension(fileName)?.ToLowerInvariant();
        return contentType.StartsWith("audio/") ||
               extension == ".mp3" || extension == ".wav" || extension == ".ogg" ||
               extension == ".m4a" || extension == ".webm";
    }

    private static string GenerateObjectKey(Guid chatId, string fileName, bool isVoice)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var extension = Path.GetExtension(fileName);
        var prefix = isVoice ? "voice" : "attachment";
        return $"chats/{chatId}/{prefix}/{timestamp}{extension}";
    }

    private static string SanitizeFileName(string fileName)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = string.Join("_", fileName.Split(invalidChars, StringSplitOptions.RemoveEmptyEntries));
        return sanitized.Length > 255 ? sanitized[..255] : sanitized;
    }
}

public class ChatMessageAttachmentDto
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public int? DurationMs { get; set; }
}
