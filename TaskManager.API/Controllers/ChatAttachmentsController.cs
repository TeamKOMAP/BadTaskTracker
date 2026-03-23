using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManager.API.Security;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Services;
using TaskManager.Infrastructure.Data;

namespace TaskManager.API.Controllers;

[Route("api/chats/{chatId:guid}/attachments")]
[ApiController]
[Authorize]
public class ChatAttachmentsController : ControllerBase
{
    private readonly IChatAttachmentService _attachmentService;
    private readonly IChatRoomMemberRepository _memberRepository;
    private readonly ApplicationDbContext _dbContext;

    public ChatAttachmentsController(
        IChatAttachmentService attachmentService,
        IChatRoomMemberRepository memberRepository,
        ApplicationDbContext dbContext)
    {
        _attachmentService = attachmentService;
        _memberRepository = memberRepository;
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ChatMessageAttachmentDto>>> GetByMessage(
        [FromRoute] Guid chatId,
        [FromQuery] long messageId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        if (messageId <= 0)
            return BadRequest(new { error = "Message id is required" });

        var attachments = await _attachmentService.GetByMessageAsync(chatId, messageId, actorUserId.Value);
        return Ok(attachments);
    }

    [HttpGet("all")]
    public async Task<ActionResult<IReadOnlyList<ChatAttachmentListItemDto>>> GetAllByChat([FromRoute] Guid chatId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        if (!await _memberRepository.IsMemberAsync(chatId, actorUserId.Value))
            return Forbid();

        var attachments = await (from attachment in _dbContext.ChatMessageAttachments
                                 join message in _dbContext.ChatMessages on attachment.MessageId equals message.Id
                                 where message.ChatRoomId == chatId
                                 orderby message.CreatedAtUtc descending
                                 select new ChatAttachmentListItemDto
                                 {
                                     Id = attachment.Id,
                                     MessageId = attachment.MessageId,
                                     SenderUserId = message.SenderUserId,
                                     FileName = attachment.FileName,
                                     ContentType = attachment.ContentType,
                                     Size = attachment.Size,
                                     DurationMs = attachment.DurationMs,
                                     CreatedAtUtc = message.CreatedAtUtc
                                 }).ToListAsync();

        return Ok(attachments);
    }

    [HttpPost]
    [RequestSizeLimit(50L * 1024 * 1024)]
    public async Task<ActionResult<ChatMessageAttachmentDto>> Upload(
        [FromRoute] Guid chatId,
        [FromForm] UploadChatAttachmentRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        if (request.File is null)
            return BadRequest(new { error = "File is required" });

        var attachment = await _attachmentService.UploadAsync(
            chatId,
            request.MessageId,
            actorUserId.Value,
            request.File);

        return Created($"/api/chats/{chatId}/attachments/{attachment.Id}", attachment);
    }

    [HttpGet("{attachmentId:guid}")]
    public async Task<IActionResult> Download(
        [FromRoute] Guid chatId,
        [FromRoute] Guid attachmentId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var content = await _attachmentService.DownloadAsync(chatId, attachmentId, actorUserId.Value);
        return File(content.Content, content.ContentType, content.FileName);
    }

    [HttpDelete("{attachmentId:guid}")]
    public async Task<IActionResult> Delete(
        [FromRoute] Guid chatId,
        [FromRoute] Guid attachmentId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        await _attachmentService.DeleteAsync(chatId, attachmentId, actorUserId.Value);
        return NoContent();
    }
}

public sealed class UploadChatAttachmentRequest
{
    public long MessageId { get; set; }
    public IFormFile? File { get; set; }
}

public sealed class ChatAttachmentListItemDto
{
    public Guid Id { get; set; }
    public long MessageId { get; set; }
    public int SenderUserId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public int? DurationMs { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
