using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.API.Security;
using TaskManager.Domain.Enums;

namespace TaskManager.API.Controllers
{
    /// <summary>
    /// Controller for managing tasks within a workspace.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class TasksController : ControllerBase
    {
        private readonly ITaskService _taskService;

        /// <summary>
        /// Initializes a new instance of the TasksController.
        /// </summary>
        /// <param name="taskService">The task service.</param>
        public TasksController(ITaskService taskService)
        {
            _taskService = taskService;
        }

        /// <summary>
        /// Gets all tasks in the current workspace with optional filtering.
        /// </summary>
        /// <param name="status">Filter by task status.</param>
        /// <param name="assigneeId">Filter by assignee user ID.</param>
        /// <param name="dueBefore">Filter tasks due before this date.</param>
        /// <param name="dueAfter">Filter tasks due after this date.</param>
        /// <param name="tagIds">Filter by tag IDs.</param>
        /// <returns>A list of tasks matching the filters.</returns>
        /// <response code="200">Returns the list of tasks</response>
        /// <response code="400">If workspace ID is missing</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
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

        /// <summary>
        /// Gets a specific task by ID.
        /// </summary>
        /// <param name="id">The task ID.</param>
        /// <returns>The task details.</returns>
        /// <response code="200">Returns the task</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
        /// <response code="404">If task is not found</response>
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

        /// <summary>
        /// Creates a new task in the current workspace.
        /// </summary>
        /// <param name="createTaskDto">The task data.</param>
        /// <returns>The created task.</returns>
        /// <response code="201">Task created successfully</response>
        /// <response code="400">If task data is invalid</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
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

        /// <summary>
        /// Updates an existing task.
        /// </summary>
        /// <param name="id">The task ID.</param>
        /// <param name="updateTaskDto">The updated task data.</param>
        /// <returns>The updated task.</returns>
        /// <response code="200">Task updated successfully</response>
        /// <response code="400">If task data is invalid or IDs don't match</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
        /// <response code="404">If task is not found</response>
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

        /// <summary>
        /// Approves a task completion that is waiting for confirmation.
        /// </summary>
        /// <param name="id">The task ID.</param>
        /// <returns>The updated task.</returns>
        /// <response code="200">Task approved</response>
        /// <response code="400">If task is not waiting for approval</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace admin or owner</response>
        /// <response code="404">If task is not found</response>
        [HttpPost("{id}/done-approval/approve")]
        public async Task<IActionResult> ApproveDone(int id)
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
                var updatedTask = await _taskService.ApproveTaskDoneAsync(workspaceId.Value, actorUserId.Value, id);
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

        /// <summary>
        /// Rejects a task completion that is waiting for confirmation.
        /// </summary>
        /// <param name="id">The task ID.</param>
        /// <returns>The updated task.</returns>
        /// <response code="200">Task rejected</response>
        /// <response code="400">If task is not waiting for approval</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace admin or owner</response>
        /// <response code="404">If task is not found</response>
        [HttpPost("{id}/done-approval/reject")]
        public async Task<IActionResult> RejectDone(int id)
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
                var updatedTask = await _taskService.RejectTaskDoneAsync(workspaceId.Value, actorUserId.Value, id);
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

        /// <summary>
        /// Deletes a task.
        /// </summary>
        /// <param name="id">The task ID.</param>
        /// <returns>No content if successful.</returns>
        /// <response code="204">Task deleted successfully</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace admin or owner</response>
        /// <response code="404">If task is not found</response>
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
