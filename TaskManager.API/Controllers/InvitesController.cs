using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Enums;

namespace TaskManager.API.Controllers
{
    /// <summary>
    /// Controller for managing workspace invitations.
    /// </summary>
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class InvitesController : ControllerBase
    {
        private readonly IWorkspaceInvitationService _workspaceInvitationService;

        /// <summary>
        /// Initializes a new instance of the InvitesController.
        /// </summary>
        /// <param name="workspaceInvitationService">The workspace invitation service.</param>
        public InvitesController(IWorkspaceInvitationService workspaceInvitationService)
        {
            _workspaceInvitationService = workspaceInvitationService;
        }

        /// <summary>
        /// Gets invitations for the current user.
        /// </summary>
        /// <param name="status">Optional status filter (Pending, Accepted, Declined, Expired).</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>List of invitations.</returns>
        /// <response code="200">Returns list of invitations</response>
        /// <response code="400">If status filter is invalid</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="404">If user is not found</response>
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

        /// <summary>
        /// Accepts a workspace invitation.
        /// </summary>
        /// <param name="id">The invitation ID.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>The accepted invitation.</returns>
        /// <response code="200">Invitation accepted successfully</response>
        /// <response code="400">If invitation cannot be accepted</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not the invite recipient</response>
        /// <response code="404">If invitation is not found</response>
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

        /// <summary>
        /// Declines a workspace invitation.
        /// </summary>
        /// <param name="id">The invitation ID.</param>
        /// <param name="cancellationToken">Cancellation token.</param>
        /// <returns>The declined invitation.</returns>
        /// <response code="200">Invitation declined successfully</response>
        /// <response code="400">If invitation cannot be declined</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not the invite recipient</response>
        /// <response code="404">If invitation is not found</response>
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
