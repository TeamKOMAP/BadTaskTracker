using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.Services;

namespace TaskManager.API.Controllers;

[Route("api/chats/{chatId:guid}/preferences")]
[ApiController]
[Authorize]
public sealed class ChatPreferencesController : ControllerBase
{
    private readonly IChatPreferenceService _preferenceService;

    public ChatPreferencesController(IChatPreferenceService preferenceService)
    {
        _preferenceService = preferenceService;
    }

    [HttpGet]
    public async Task<ActionResult<ChatPreferenceDto>> Get([FromRoute] Guid chatId)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var preference = await _preferenceService.GetAsync(chatId, actorUserId.Value);
        return Ok(preference);
    }

    [HttpPatch]
    public async Task<ActionResult<ChatPreferenceDto>> Update(
        [FromRoute] Guid chatId,
        [FromBody] UpdateChatPreferenceRequest request)
    {
        var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
        if (!actorUserId.HasValue)
            return Unauthorized(new { error = "Actor user id is required" });

        var preference = await _preferenceService.UpdateAsync(chatId, actorUserId.Value, request);
        return Ok(preference);
    }
}
