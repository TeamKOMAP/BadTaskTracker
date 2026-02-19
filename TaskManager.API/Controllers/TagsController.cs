using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.API.Security;

namespace TaskManager.API.Controllers
{
    /// <summary>
    /// Controller for managing tags within a workspace.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class TagsController : ControllerBase
    {
        private readonly ITagService _tagService;

        /// <summary>
        /// Initializes a new instance of the TagsController.
        /// </summary>
        /// <param name="tagService">The tag service.</param>
        public TagsController(ITagService tagService)
        {
            _tagService = tagService;
        }

        /// <summary>
        /// Gets all tags in the current workspace with optional search.
        /// </summary>
        /// <param name="q">Optional search query for tag name.</param>
        /// <returns>List of tags.</returns>
        /// <response code="200">Returns list of tags</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
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

        /// <summary>
        /// Gets a specific tag by ID.
        /// </summary>
        /// <param name="id">The tag ID.</param>
        /// <returns>The tag details.</returns>
        /// <response code="200">Returns the tag</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
        /// <response code="404">If tag is not found</response>
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

        /// <summary>
        /// Creates a new tag or returns existing one with the same name.
        /// </summary>
        /// <param name="dto">The tag creation data.</param>
        /// <returns>The created or existing tag.</returns>
        /// <response code="200">Returns existing tag</response>
        /// <response code="201">Tag created successfully</response>
        /// <response code="400">If tag data is invalid</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a workspace member</response>
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
