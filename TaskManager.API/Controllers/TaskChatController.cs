using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.Services;
using TaskManager.API.Security;

namespace TaskManager.API.Controllers;

[Route("api/tasks/{taskId:int}/chat")]
[ApiController]
[Authorize]
public class TaskChatController : ControllerBase
{
    private readonly IChatService _chatService;

    public TaskChatController(IChatService chatService)
    {
        _chatService = chatService;
    }

    [HttpPost("open")]
    public async Task<ActionResult<ChatRoomDto>> OpenTaskChat(
        [FromRoute] int taskId,
        [FromQuery] int workspaceId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var chat = await _chatService.OpenTaskChatAsync(taskId, workspaceId, actorUserId.Value);
        return Ok(chat);
    }
}
