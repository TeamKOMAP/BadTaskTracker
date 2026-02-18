using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Exceptions;
using TaskManager.API.Security;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly IReportService _reportService;

        public ReportsController(IReportService reportService)
        {
            _reportService = reportService;
        }

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
