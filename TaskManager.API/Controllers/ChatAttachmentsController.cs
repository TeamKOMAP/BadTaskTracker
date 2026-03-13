using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.Services;

namespace TaskManager.API.Controllers;

[Route("api/chats/{chatId:guid}/attachments")]
[ApiController]
[Authorize]
public class ChatAttachmentsController : ControllerBase
{
    private readonly IChatAttachmentService _attachmentService;

    public ChatAttachmentsController(IChatAttachmentService attachmentService)
    {
        _attachmentService = attachmentService;
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
