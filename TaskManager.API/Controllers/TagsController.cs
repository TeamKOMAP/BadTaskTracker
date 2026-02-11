using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.API.Security;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TagsController : ControllerBase
    {
        private readonly ITagService _tagService;

        public TagsController(ITagService tagService)
        {
            _tagService = tagService;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<TagDto>>> GetTags([FromQuery] string? q = null)
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
                var tags = await _tagService.GetTagsAsync(workspaceId.Value, actorUserId.Value, q);
                return Ok(tags);
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<TagDto>> GetTagById(int id)
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
                var tag = await _tagService.GetTagByIdAsync(workspaceId.Value, actorUserId.Value, id);
                return Ok(tag);
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
        public async Task<ActionResult<TagDto>> CreateOrGetTag([FromBody] CreateTagDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

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
                var result = await _tagService.CreateOrGetTagAsync(workspaceId.Value, actorUserId.Value, dto);
                if (!result.Created)
                {
                    return Ok(result.Tag);
                }

                return CreatedAtAction(nameof(GetTagById), new { id = result.Tag.Id }, result.Tag);
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
    }
}
