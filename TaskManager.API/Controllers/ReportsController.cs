using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.Interfaces;
using TaskManager.Application.DTOs;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
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
            var summary = await _reportService.GetStatusSummaryAsync();
            return Ok(summary);
        }

        [HttpGet("overdue-by-assignee")]
        public async Task<ActionResult<IEnumerable<Application.DTOs.OverdueByAssigneeDto>>> GetOverdueByAssignee()
        {
            var overdueTasks = await _reportService.GetOverdueTasksByAssigneeAsync();
            return Ok(overdueTasks);
        }

        [HttpGet("avg-completion-time")]
        public async Task<ActionResult<Application.DTOs.AverageCompletionTimeDto>> GetAverageCompletionTime()
        {
            var avgTime = await _reportService.GetAverageCompletionTimeAsync();
            return Ok(avgTime);
        }
    }
}