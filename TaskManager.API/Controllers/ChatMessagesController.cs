using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.Services;
using TaskManager.API.Security;
using TaskManager.Domain.Enums;

namespace TaskManager.API.Controllers;

[Route("api/chats/{chatId:guid}/messages")]
[ApiController]
[Authorize]
public class ChatMessagesController : ControllerBase
{
    private readonly IChatMessageService _messageService;

    public ChatMessagesController(IChatMessageService messageService)
    {
        _messageService = messageService;
    }

    [HttpGet]
    public async Task<ActionResult<List<ChatMessageDto>>> GetMessages(
        [FromRoute] Guid chatId,
        [FromQuery] int limit = 50,
        [FromQuery] long? beforeMessageId = null)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var messages = await _messageService.GetMessagesAsync(chatId, actorUserId.Value, limit, beforeMessageId);
        return Ok(messages);
    }

    [HttpPost]
    public async Task<ActionResult<ChatMessageDto>> SendMessage(
        [FromRoute] Guid chatId,
        [FromBody] SendMessageRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var message = await _messageService.SendMessageAsync(chatId, actorUserId.Value, request);
        return Created($"/api/chats/{chatId}/messages/{message.Id}", message);
    }

    [HttpPatch("{messageId:long}")]
    public async Task<ActionResult<ChatMessageDto>> EditMessage(
        [FromRoute] Guid chatId,
        [FromRoute] long messageId,
        [FromBody] EditMessageRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var message = await _messageService.EditMessageAsync(chatId, messageId, actorUserId.Value, request.BodyCipher);
        return Ok(message);
    }

    [HttpDelete("{messageId:long}")]
    public async Task<IActionResult> DeleteMessage(
        [FromRoute] Guid chatId,
        [FromRoute] long messageId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        await _messageService.DeleteMessageAsync(chatId, messageId, actorUserId.Value);
        return NoContent();
    }

    [HttpPost("{messageId:long}/reply")]
    public async Task<ActionResult<ChatMessageDto>> ReplyToMessage(
        [FromRoute] Guid chatId,
        [FromRoute] long messageId,
        [FromBody] SendMessageRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var message = await _messageService.ReplyToMessageAsync(chatId, messageId, actorUserId.Value, request);
        return Created($"/api/chats/{chatId}/messages/{message.Id}", message);
    }

    [HttpPost("{messageId:long}/forward")]
    public async Task<ActionResult<ChatMessageDto>> ForwardMessage(
        [FromRoute] Guid chatId,
        [FromRoute] long messageId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var message = await _messageService.ForwardMessageAsync(chatId, messageId, actorUserId.Value);
        return Created($"/api/chats/{chatId}/messages/{message.Id}", message);
    }

    [HttpPost("read")]
    public async Task<IActionResult> MarkAsRead(
        [FromRoute] Guid chatId,
        [FromBody] MarkAsReadRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        await _messageService.MarkAsReadAsync(chatId, actorUserId.Value, request.LastReadMessageId);
        return NoContent();
    }
}

public class EditMessageRequest
{
    public string? BodyCipher { get; set; }
}

public class MarkAsReadRequest
{
    public long LastReadMessageId { get; set; }
}
