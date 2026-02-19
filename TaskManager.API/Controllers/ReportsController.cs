using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Exceptions;
using TaskManager.API.Security;

namespace TaskManager.API.Controllers
{
    /// <summary>
    /// Controller for generating workspace reports and statistics.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;

        /// <summary>
        /// Initializes a new instance of the ReportsController.
        /// </summary>
        /// <param name="reportService">The report service.</param>
        public ReportsController(IReportService reportService)
        {
            _reportService = reportService;
        }

        /// <summary>
        /// Gets a summary of task statuses in the current workspace.
        /// </summary>
        /// <returns>Task status summary counts.</returns>
        /// <response code="200">Returns status summary</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
        [HttpGet("status-summary")]
        public async Task<ActionResult<Application.DTOs.StatusSummaryDto>> GetStatusSummary()
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue)
            {
                return BadRequest(new { error = "Workspace id is required" });
            }

            try
            {
                var summary = await _reportService.GetStatusSummaryAsync(workspaceId.Value, actorUserId.Value);
                return Ok(summary);
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Gets overdue tasks grouped by assignee.
        /// </summary>
        /// <returns>List of overdue tasks grouped by assignee.</returns>
        /// <response code="200">Returns overdue tasks by assignee</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
        [HttpGet("overdue-by-assignee")]
        public async Task<ActionResult<IEnumerable<Application.DTOs.OverdueByAssigneeDto>>> GetOverdueByAssignee()
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue)
            {
                return BadRequest(new { error = "Workspace id is required" });
            }

            try
            {
                var overdueTasks = await _reportService.GetOverdueTasksByAssigneeAsync(workspaceId.Value, actorUserId.Value);
                return Ok(overdueTasks);
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Gets average task completion time statistics.
        /// </summary>
        /// <returns>Average completion time in days and hours.</returns>
        /// <response code="200">Returns average completion time stats</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
        [HttpGet("avg-completion-time")]
        public async Task<ActionResult<Application.DTOs.AverageCompletionTimeDto>> GetAverageCompletionTime()
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue)
            {
                return BadRequest(new { error = "Workspace id is required" });
            }

            try
            {
                var avgTime = await _reportService.GetAverageCompletionTimeAsync(workspaceId.Value, actorUserId.Value);
                return Ok(avgTime);
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }
    }
}
