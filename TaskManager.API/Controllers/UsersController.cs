using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManager.Application.DTOs;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public UsersController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<UserDto>>> GetUsers([FromQuery] string? q = null)
        {
            var query = _context.Users.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(q))
            {
                var needle = q.Trim().ToLower();
                query = query.Where(u =>
                    u.Name.ToLower().Contains(needle) ||
                    u.Email.ToLower().Contains(needle) ||
                    u.Id.ToString() == needle);
            }

            var users = await query
                .OrderBy(u => u.Name)
                .GroupJoin(
                    _context.Tasks.AsNoTracking(),
                    u => u.Id,
                    t => t.AssigneeId,
                    (u, tasks) => new UserDto
                    {
                        Id = u.Id,
                        Name = u.Name,
                        Email = u.Email,
                        CreatedAt = u.CreatedAt,
                        TaskCount = tasks.Count()
                    })
                .ToListAsync();

            return Ok(users);
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<UserDto>> GetUserById(int id)
        {
            var user = await _context.Users
                .AsNoTracking()
                .Where(u => u.Id == id)
                .Select(u => new UserDto
                {
                    Id = u.Id,
                    Name = u.Name,
                    Email = u.Email,
                    CreatedAt = u.CreatedAt,
                    TaskCount = _context.Tasks.Count(t => t.AssigneeId == u.Id)
                })
                .FirstOrDefaultAsync();

            if (user == null)
            {
                return NotFound();
            }

            return Ok(user);
        }

        [HttpPost]
        public async Task<ActionResult<UserDto>> CreateUser([FromBody] CreateUserDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            var email = dto.Email.Trim();
            var name = string.IsNullOrWhiteSpace(dto.Name)
                ? email.Split('@')[0]
                : dto.Name.Trim();

            var exists = await _context.Users.AnyAsync(u => u.Email.ToLower() == email.ToLower());
            if (exists)
            {
                return Conflict(new { error = "User with this email already exists" });
            }

            var user = new User
            {
                Name = name,
                Email = email,
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            var result = new UserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                CreatedAt = user.CreatedAt,
                TaskCount = 0
            };

            return CreatedAtAction(nameof(GetUserById), new { id = user.Id }, result);
        }
    }
}
