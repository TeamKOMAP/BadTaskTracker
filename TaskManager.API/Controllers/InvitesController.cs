using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Enums;

namespace TaskManager.API.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class InvitesController : ControllerBase
    {
        private readonly IWorkspaceInvitationService _workspaceInvitationService;

        public InvitesController(IWorkspaceInvitationService workspaceInvitationService)
        {
            _workspaceInvitationService = workspaceInvitationService;
        }

        [HttpGet("me")]
        public async Task<IActionResult> GetMyInvites([FromQuery] string? status, CancellationToken cancellationToken)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            WorkspaceInvitationStatus? statusFilter = null;
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (Enum.TryParse<WorkspaceInvitationStatus>(status, true, out var parsed)
                    && Enum.IsDefined(typeof(WorkspaceInvitationStatus), parsed))
                {
                    statusFilter = parsed;
                }
                else
                {
                    return BadRequest(new { error = "Invalid invitation status filter" });
                }
            }

            try
            {
                var invites = await _workspaceInvitationService.GetUserInvitationsAsync(
                    actorUserId.Value,
                    statusFilter,
                    cancellationToken);
                return Ok(invites);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPost("{id:int}/accept")]
        public async Task<IActionResult> AcceptInvite(int id, CancellationToken cancellationToken)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            try
            {
                var invite = await _workspaceInvitationService.AcceptInvitationAsync(actorUserId.Value, id, cancellationToken);
                return Ok(invite);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPost("{id:int}/decline")]
        public async Task<IActionResult> DeclineInvite(int id, CancellationToken cancellationToken)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            try
            {
                var invite = await _workspaceInvitationService.DeclineInvitationAsync(actorUserId.Value, id, cancellationToken);
                return Ok(invite);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }
    }
}
