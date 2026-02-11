using Microsoft.AspNetCore.Mvc;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;

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
            var tags = await _tagService.GetTagsAsync(q);
            return Ok(tags);
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<TagDto>> GetTagById(int id)
        {
            try
            {
                var tag = await _tagService.GetTagByIdAsync(id);
                return Ok(tag);
            }
            catch (NotFoundException)
            {
                return NotFound();
            }
        }

        [HttpPost]
        public async Task<ActionResult<TagDto>> CreateOrGetTag([FromBody] CreateTagDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            try
            {
                var result = await _tagService.CreateOrGetTagAsync(dto);
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
        }
    }
}
