using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Realtime;
using TaskManager.Application.Services;
using TaskManager.Application.Storage;
using TaskManager.Domain.Entities;
using TaskManager.Domain.Enums;
using ChatSettings = TaskManager.Chat.Application.Configuration.ChatSettings;

namespace TaskManager.Chat.Infrastructure.Services;

public sealed class ChatAttachmentServiceImpl : IChatAttachmentService
{
    private readonly IChatRepository _chatRepository;
    private readonly IChatMessageRepository _messageRepository;
    private readonly IChatMessageAttachmentRepository _attachmentRepository;
    private readonly IChatRoomMemberRepository _memberRepository;
    private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
    private readonly IObjectStorage _objectStorage;
    private readonly StorageSettings _storageSettings;
    private readonly ChatSettings _chatSettings;
    private readonly IChatRealtimeNotifier _chatRealtimeNotifier;

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

    private const long MaxFileSize = 50 * 1024 * 1024;
    private const long MaxVoiceSize = 10 * 1024 * 1024;
    private const long MaxImageSize = 10 * 1024 * 1024;

    public ChatAttachmentServiceImpl(
        IChatRepository chatRepository,
        IChatMessageRepository messageRepository,
        IChatMessageAttachmentRepository attachmentRepository,
        IChatRoomMemberRepository memberRepository,
        IWorkspaceMemberRepository workspaceMemberRepository,
        IObjectStorage objectStorage,
        StorageSettings storageSettings,
        IOptions<ChatSettings> chatOptions,
        IChatRealtimeNotifier chatRealtimeNotifier)
    {
        _chatRepository = chatRepository;
        _messageRepository = messageRepository;
        _attachmentRepository = attachmentRepository;
        _memberRepository = memberRepository;
        _workspaceMemberRepository = workspaceMemberRepository;
        _objectStorage = objectStorage;
        _storageSettings = storageSettings;
        _chatSettings = chatOptions.Value;
        _chatRealtimeNotifier = chatRealtimeNotifier;
    }

    public async Task<ChatMessageAttachmentDto> UploadAsync(Guid chatId, long messageId, int userId, IFormFile file, CancellationToken ct = default)
    {
        if (messageId <= 0)
        {
            throw new ValidationException("Message id is invalid");
        }

        var chat = await EnsureChatAndMembershipAsync(chatId, userId, ct);
        var message = await EnsureMessageBelongsToChatAsync(chatId, messageId, ct);

        var existingAttachments = await _attachmentRepository.GetByMessageIdAsync(messageId, ct);
        if (existingAttachments.Count >= _chatSettings.MaxAttachmentsPerMessage)
        {
            throw new ValidationException(
                $"Attachments per message limit exceeded. Max allowed: {_chatSettings.MaxAttachmentsPerMessage}");
        }

        var contentType = NormalizeContentType(file.ContentType);

        ValidateFile(file, contentType);

        var isVoice = IsVoiceMessage(file.FileName, contentType);
        var isImage = AllowedImageMimeTypes.Contains(contentType);

        if (!isVoice && !isImage && !AllowedFileMimeTypes.Contains(contentType))
        {
            throw new ValidationException("Unsupported file type");
        }

        var maxSize = isVoice ? MaxVoiceSize : (isImage ? MaxImageSize : MaxFileSize);
        if (file.Length > maxSize)
        {
            throw new ValidationException($"File size exceeds maximum allowed size of {maxSize / 1024 / 1024}MB");
        }

        var objectKey = GenerateObjectKey(chatId, messageId, file.FileName, isVoice);

        await using var validatedContent = await ValidateAndSanitizeFileAsync(file, isImage, contentType, ct);

        await _objectStorage.UploadAsync(
            _storageSettings.PrivateBucket,
            objectKey,
            validatedContent,
            contentType,
            ct);

        var attachment = new ChatMessageAttachment
        {
            Id = Guid.NewGuid(),
            MessageId = message.Id,
            ObjectKey = objectKey,
            FileName = SanitizeFileName(file.FileName),
            ContentType = contentType,
            Size = file.Length,
            DurationMs = null
        };

        await _attachmentRepository.AddAsync(attachment, ct);

        chat.UpdatedAtUtc = DateTime.UtcNow;
        await _chatRepository.UpdateAsync(chat, ct);

        await _chatRealtimeNotifier.AttachmentUploadedAsync(
            new ChatAttachmentRealtimeEvent(
                chat.Id,
                attachment.Id,
                attachment.MessageId,
                attachment.FileName,
                attachment.ContentType,
                attachment.Size,
                attachment.DurationMs,
                DateTime.UtcNow),
            ct);

        return MapToDto(attachment);
    }

    public async Task<IReadOnlyList<ChatMessageAttachmentDto>> GetByMessageAsync(
        Guid chatId,
        long messageId,
        int userId,
        CancellationToken ct = default)
    {
        if (messageId <= 0)
        {
            throw new ValidationException("Message id is invalid");
        }

        await EnsureChatAndMembershipAsync(chatId, userId, ct);
        await EnsureMessageBelongsToChatAsync(chatId, messageId, ct);

        var attachments = await _attachmentRepository.GetByMessageIdAsync(messageId, ct);
        return attachments.Select(MapToDto).ToList();
    }

    public async Task<(Stream Content, string FileName, string ContentType)> DownloadAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default)
    {
        await EnsureChatAndMembershipAsync(chatId, userId, ct);
        var attachment = await EnsureAttachmentBelongsToChatAsync(chatId, attachmentId, ct);

        var stream = await _objectStorage.OpenReadAsync(
            _storageSettings.PrivateBucket,
            attachment.ObjectKey,
            ct);

        if (stream == null)
        {
            throw new NotFoundException("Attachment content not found");
        }

        return (stream, attachment.FileName, attachment.ContentType);
    }

    public async Task DeleteAsync(Guid chatId, Guid attachmentId, int userId, CancellationToken ct = default)
    {
        var chat = await EnsureChatAndMembershipAsync(chatId, userId, ct);
        var member = await _memberRepository.GetMemberAsync(chatId, userId, ct)
            ?? throw new ForbiddenException("User is not a member of this chat");
        var attachment = await EnsureAttachmentBelongsToChatAsync(chatId, attachmentId, ct);
        var message = await _messageRepository.GetByIdAsync(attachment.MessageId, ct)
            ?? throw new NotFoundException("Message not found");

        var canDelete = message.SenderUserId == userId
            || member.Role == ChatMemberRole.GroupOwner
            || (chat.Type == ChatRoomType.General && await IsWorkspaceAdminAsync(chat.WorkspaceId, userId));

        if (!canDelete)
        {
            throw new ForbiddenException("User does not have permission to delete this attachment");
        }

        await _objectStorage.DeleteAsync(_storageSettings.PrivateBucket, attachment.ObjectKey, ct);
        await _attachmentRepository.DeleteAsync(attachmentId, ct);

        await _chatRealtimeNotifier.AttachmentDeletedAsync(
            new ChatAttachmentDeletedRealtimeEvent(
                chat.Id,
                attachment.Id,
                attachment.MessageId,
                DateTime.UtcNow),
            ct);
    }

    private async Task<ChatRoom> EnsureChatAndMembershipAsync(Guid chatId, int userId, CancellationToken ct)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct)
            ?? throw new NotFoundException("Chat not found");

        if (!await _memberRepository.IsMemberAsync(chatId, userId, ct))
        {
            throw new ForbiddenException("User is not a member of this chat");
        }

        return chat;
    }

    private async Task<ChatMessage> EnsureMessageBelongsToChatAsync(Guid chatId, long messageId, CancellationToken ct)
    {
        var message = await _messageRepository.GetByIdAsync(messageId, ct)
            ?? throw new NotFoundException("Message not found");

        if (message.ChatRoomId != chatId)
        {
            throw new NotFoundException("Message not found in this chat");
        }

        return message;
    }

    private async Task<ChatMessageAttachment> EnsureAttachmentBelongsToChatAsync(
        Guid chatId,
        Guid attachmentId,
        CancellationToken ct)
    {
        var attachment = await _attachmentRepository.GetByIdAsync(attachmentId, ct)
            ?? throw new NotFoundException("Attachment not found");

        var message = await _messageRepository.GetByIdAsync(attachment.MessageId, ct)
            ?? throw new NotFoundException("Message not found");

        if (message.ChatRoomId != chatId)
        {
            throw new NotFoundException("Attachment not found");
        }

        return attachment;
    }

    private static string NormalizeContentType(string? contentType)
    {
        return string.IsNullOrWhiteSpace(contentType)
            ? "application/octet-stream"
            : contentType.Trim();
    }

    private static void ValidateFile(IFormFile file, string contentType)
    {
        if (file.Length == 0)
        {
            throw new ValidationException("File is empty");
        }

        if (file.Length < 0)
        {
            throw new ValidationException("File is invalid");
        }

        if (string.IsNullOrWhiteSpace(file.FileName))
        {
            throw new ValidationException("File name is required");
        }

        if (string.Equals(contentType, "application/x-msdownload", StringComparison.OrdinalIgnoreCase))
        {
            throw new ValidationException("Executable files are not allowed");
        }

        var extension = Path.GetExtension(file.FileName)?.ToLowerInvariant();
        if (extension == ".exe" || extension == ".bat" || extension == ".cmd" || extension == ".sh")
        {
            throw new ValidationException("Executable files are not allowed");
        }
    }

    private static async Task<MemoryStream> ValidateAndSanitizeFileAsync(
        IFormFile file,
        bool isImage,
        string contentType,
        CancellationToken ct)
    {
        var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream, ct);
        memoryStream.Position = 0;

        if (isImage)
        {
            ValidateImage(memoryStream);
        }
        else
        {
            ValidateFileMagicBytes(memoryStream, contentType);
        }

        memoryStream.Position = 0;
        return memoryStream;
    }

    private static void ValidateImage(Stream stream)
    {
        stream.Position = 0;
        var header = new byte[12];
        var bytesRead = stream.Read(header, 0, header.Length);
        stream.Position = 0;

        if (bytesRead < 4)
        {
            throw new ValidationException("Invalid image format");
        }

        if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            return;
        }

        if (header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47)
        {
            return;
        }

        if (header[0] == 0x47 && header[1] == 0x49 && header[2] == 0x46)
        {
            return;
        }

        if (bytesRead >= 12
            && header[0] == 0x52
            && header[1] == 0x49
            && header[2] == 0x46
            && header[3] == 0x46
            && header[8] == 0x57
            && header[9] == 0x45
            && header[10] == 0x42
            && header[11] == 0x50)
        {
            return;
        }

        throw new ValidationException("Invalid image format");
    }

    private static void ValidateFileMagicBytes(Stream stream, string contentType)
    {
        stream.Position = 0;
        var header = new byte[4];
        _ = stream.Read(header, 0, 4);
        stream.Position = 0;

        if (contentType == "application/pdf" && (header[0] != 0x25 || header[1] != 0x50))
        {
            throw new ValidationException("Invalid PDF file");
        }
    }

    private static bool IsVoiceMessage(string fileName, string contentType)
    {
        var extension = Path.GetExtension(fileName)?.ToLowerInvariant();
        return contentType.StartsWith("audio/")
               || extension == ".mp3"
               || extension == ".wav"
               || extension == ".ogg"
               || extension == ".m4a"
               || extension == ".webm";
    }

    private static string GenerateObjectKey(Guid chatId, long messageId, string fileName, bool isVoice)
    {
        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var extension = Path.GetExtension(fileName);
        var prefix = isVoice ? "voice" : "attachment";
        return $"chats/{chatId}/messages/{messageId}/{prefix}/{timestamp}_{Guid.NewGuid():N}{extension}";
    }

    private static string SanitizeFileName(string fileName)
    {
        var normalized = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            normalized = "file";
        }

        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = string.Join("_", normalized.Split(invalidChars, StringSplitOptions.RemoveEmptyEntries));
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            sanitized = "file";
        }

        return sanitized.Length > 255 ? sanitized[..255] : sanitized;
    }

    private async Task<bool> IsWorkspaceAdminAsync(int workspaceId, int userId)
    {
        var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, userId);
        return member?.Role == WorkspaceRole.Admin || member?.Role == WorkspaceRole.Owner;
    }

    private static ChatMessageAttachmentDto MapToDto(ChatMessageAttachment attachment)
    {
        return new ChatMessageAttachmentDto
        {
            Id = attachment.Id,
            MessageId = attachment.MessageId,
            FileName = attachment.FileName,
            ContentType = attachment.ContentType,
            Size = attachment.Size,
            DurationMs = attachment.DurationMs
        };
    }
}
