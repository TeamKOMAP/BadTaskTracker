using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.Services;
using TaskManager.API.Security;
using TaskManager.Domain.Enums;

namespace TaskManager.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly IChatService _chatService;

    public ChatsController(IChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpGet]
    public async Task<ActionResult<List<ChatRoomDto>>> GetChats(
        [FromQuery] int workspaceId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var chats = await _chatService.GetChatsAsync(workspaceId, actorUserId.Value);
        return Ok(chats);
    }

    [HttpGet("{chatId:guid}")]
    public async Task<ActionResult<ChatRoomDto>> GetChat(
        [FromRoute] Guid chatId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var chat = await _chatService.GetChatAsync(chatId, actorUserId.Value);
        return Ok(chat);
    }

    [HttpPost("groups")]
    public async Task<ActionResult<ChatRoomDto>> CreateGroupChat(
        [FromBody] CreateGroupChatRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var chat = await _chatService.CreateGroupChatAsync(
            request.WorkspaceId, 
            request.Title, 
            actorUserId.Value);
        return CreatedAtAction(nameof(GetChat), new { chatId = chat.Id }, chat);
    }

    [HttpPost("direct/{userId:int}")]
    public async Task<ActionResult<ChatRoomDto>> CreateDirectChat(
        [FromQuery] int workspaceId,
        [FromRoute] int userId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var chat = await _chatService.CreateDirectChatAsync(
            workspaceId, 
            actorUserId.Value, 
            userId);
        return CreatedAtAction(nameof(GetChat), new { chatId = chat.Id }, chat);
    }

    [HttpPatch("{chatId:guid}/settings")]
    public async Task<IActionResult> UpdateChatSettings(
        [FromRoute] Guid chatId,
        [FromBody] UpdateChatSettingsRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        await _chatService.UpdateChatSettingsAsync(chatId, actorUserId.Value, request.Title);
        return NoContent();
    }

    [HttpPost("{chatId:guid}/members")]
    public async Task<IActionResult> AddMember(
        [FromRoute] Guid chatId,
        [FromBody] AddMemberRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        await _chatService.AddMemberAsync(chatId, request.UserId, actorUserId.Value);
        return NoContent();
    }

    [HttpDelete("{chatId:guid}/members/{userId:int}")]
    public async Task<IActionResult> RemoveMember(
        [FromRoute] Guid chatId,
        [FromRoute] int userId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        await _chatService.RemoveMemberAsync(chatId, userId, actorUserId.Value);
        return NoContent();
    }

    [HttpPatch("{chatId:guid}/members/{userId:int}/role")]
    public async Task<IActionResult> UpdateMemberRole(
        [FromRoute] Guid chatId,
        [FromRoute] int userId,
        [FromBody] UpdateMemberRoleRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        await _chatService.UpdateMemberRoleAsync(chatId, userId, request.Role, actorUserId.Value);
        return NoContent();
    }
}

public class CreateGroupChatRequest
{
    public int WorkspaceId { get; set; }
    public string Title { get; set; } = string.Empty;
}

public class UpdateChatSettingsRequest
{
    public string? Title { get; set; }
}

public class AddMemberRequest
{
    public int UserId { get; set; }
}

public class UpdateMemberRoleRequest
{
    public ChatMemberRole Role { get; set; }
}
