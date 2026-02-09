using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.DTOs;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Enums;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
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
            [FromQuery] List<int>? tagIds) // Добавь nullable здесь
        {
            var tasks = await _taskService.GetTasksAsync(status, assigneeId, dueBefore, dueAfter, tagIds);
            return Ok(tasks);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<TaskDto>> GetTask(int id)
        {
            try
            {
                var task = await _taskService.GetTaskByIdAsync(id);
                return Ok(task);
            }
            catch (Application.Exceptions.NotFoundException)
            {
                return NotFound();
            }
        }

        [HttpPost]
        public async Task<ActionResult<TaskDto>> CreateTask(CreateTaskDto createTaskDto)
        {
            try
            {
                var createdTask = await _taskService.CreateTaskAsync(createTaskDto);
                return CreatedAtAction(nameof(GetTask), new { id = createdTask.Id }, createdTask);
            }
            catch (Application.Exceptions.ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateTask(int id, UpdateTaskDto updateTaskDto)
        {
            if (id != updateTaskDto.Id)
                return BadRequest("Task ID mismatch");

            try
            {
                var updatedTask = await _taskService.UpdateTaskAsync(updateTaskDto);
                return Ok(updatedTask); // Возвращаем обновлённую задачу
            }
            catch (Application.Exceptions.ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Application.Exceptions.NotFoundException)
            {
                return NotFound();
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTask(int id)
        {
            try
            {
                await _taskService.DeleteTaskAsync(id);
                return NoContent();
            }
            catch (Application.Exceptions.NotFoundException)
            {
                return NotFound();
            }
        }
    }
}