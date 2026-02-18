using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.API.Security;
using TaskManager.Domain.Enums;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class TasksController : ControllerBase
    {
        private readonly ITaskService _taskService;

        public TasksController(ITaskService taskService)
        {
            _taskService = taskService;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<TaskDto>>> GetTasks(
            [FromQuery] TaskItemStatus? status,
            [FromQuery] int? assigneeId,
            [FromQuery] DateTime? dueBefore,
            [FromQuery] DateTime? dueAfter,
            [FromQuery] List<int>? tagIds)
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
                var tasks = await _taskService.GetTasksAsync(workspaceId.Value, actorUserId.Value, status, assigneeId, dueBefore, dueAfter, tagIds);
                return Ok(tasks);
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<TaskDto>> GetTask(int id)
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
                var task = await _taskService.GetTaskByIdAsync(workspaceId.Value, actorUserId.Value, id);
                return Ok(task);
            }
            catch (NotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        [HttpPost]
        public async Task<ActionResult<TaskDto>> CreateTask(CreateTaskDto createTaskDto)
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
                var createdTask = await _taskService.CreateTaskAsync(workspaceId.Value, actorUserId.Value, createTaskDto);
                return CreatedAtAction(nameof(GetTask), new { id = createdTask.Id }, createdTask);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateTask(int id, UpdateTaskDto updateTaskDto)
        {
            if (id != updateTaskDto.Id)
                return BadRequest("Task ID mismatch");

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
                var updatedTask = await _taskService.UpdateTaskAsync(workspaceId.Value, actorUserId.Value, updateTaskDto);
                return Ok(updatedTask);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (NotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTask(int id)
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
                await _taskService.DeleteTaskAsync(workspaceId.Value, actorUserId.Value, id);
                return NoContent();
            }
            catch (NotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }
    }
}
