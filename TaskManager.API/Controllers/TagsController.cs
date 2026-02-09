using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TagsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public TagsController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<TagDto>>> GetTags([FromQuery] string? q = null)
        {
            var query = _context.Tags.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(q))
            {
                var needle = q.Trim().ToLower();
                query = query.Where(t => t.Name.ToLower().Contains(needle) || t.Id.ToString() == needle);
            }

            var tags = await query
                .OrderBy(t => t.Name)
                .Select(t => new TagDto
                {
                    Id = t.Id,
                    Name = t.Name,
                    CreatedAt = t.CreatedAt,
                    Color = string.Empty
                })
                .ToListAsync();

            return Ok(tags);
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<TagDto>> GetTagById(int id)
        {
            var tag = await _context.Tags
                .AsNoTracking()
                .Where(t => t.Id == id)
                .Select(t => new TagDto
                {
                    Id = t.Id,
                    Name = t.Name,
                    CreatedAt = t.CreatedAt,
                    Color = string.Empty
                })
                .FirstOrDefaultAsync();

            if (tag == null)
            {
                return NotFound();
            }

            return Ok(tag);
        }

        [HttpPost]
        public async Task<ActionResult<TagDto>> CreateOrGetTag([FromBody] CreateTagDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            var name = dto.Name.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                return BadRequest(new { error = "Tag name is required" });
            }

            var existing = await _context.Tags
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Name.ToLower() == name.ToLower());

            if (existing != null)
            {
                return Ok(new TagDto
                {
                    Id = existing.Id,
                    Name = existing.Name,
                    CreatedAt = existing.CreatedAt,
                    Color = string.Empty
                });
            }

            var tag = new Tag
            {
                Name = name,
                CreatedAt = DateTime.UtcNow
            };

            _context.Tags.Add(tag);
            await _context.SaveChangesAsync();

            var created = new TagDto
            {
                Id = tag.Id,
                Name = tag.Name,
                CreatedAt = tag.CreatedAt,
                Color = string.Empty
            };

            return CreatedAtAction(nameof(GetTagById), new { id = tag.Id }, created);
        }
    }
}
