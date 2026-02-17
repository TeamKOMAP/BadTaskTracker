using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;

namespace TaskManager.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class SpacesController : ControllerBase
    {
        private const long MaxAvatarSizeBytes = 5L * 1024 * 1024;
        private static readonly HashSet<string> AllowedAvatarContentTypes =
            new(StringComparer.OrdinalIgnoreCase)
            {
                "image/jpeg",
                "image/png",
                "image/webp"
            };

        private readonly IWorkspaceService _workspaceService;
        private readonly IWebHostEnvironment _environment;

        public SpacesController(IWorkspaceService workspaceService, IWebHostEnvironment environment)
        {
            _workspaceService = workspaceService;
            _environment = environment;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<WorkspaceDto>>> GetSpaces()
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            var spaces = await _workspaceService.GetWorkspacesAsync(actorUserId.Value);
            return Ok(spaces);
        }

        [HttpGet("{workspaceId:int}")]
        public async Task<ActionResult<WorkspaceDto>> GetSpace(int workspaceId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            try
            {
                var space = await _workspaceService.GetWorkspaceAsync(actorUserId.Value, workspaceId);
                return Ok(space);
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
        public async Task<ActionResult<WorkspaceDto>> CreateSpace([FromBody] CreateWorkspaceDto dto)
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

            try
            {
                var created = await _workspaceService.CreateWorkspaceAsync(actorUserId.Value, dto);
                return CreatedAtAction(nameof(GetSpace), new { workspaceId = created.Id }, created);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPut("{workspaceId:int}")]
        public async Task<ActionResult<WorkspaceDto>> UpdateSpace(int workspaceId, [FromBody] UpdateWorkspaceDto dto)
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

            try
            {
                var updated = await _workspaceService.UpdateWorkspaceAsync(actorUserId.Value, workspaceId, dto);
                return Ok(updated);
            }
            catch (NotFoundException)
            {
                return NotFound();
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("{workspaceId:int}/avatar")]
        [RequestSizeLimit(20L * 1024 * 1024)]
        public async Task<ActionResult<WorkspaceDto>> SetSpaceAvatar(int workspaceId, IFormFile? file)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            if (file == null || file.Length <= 0)
            {
                return BadRequest(new { error = "Avatar file is required" });
            }

            if (file.Length > MaxAvatarSizeBytes)
            {
                return BadRequest(new { error = "Avatar is too large. Max size is 5 MB." });
            }

            if (!string.IsNullOrWhiteSpace(file.ContentType)
                && !AllowedAvatarContentTypes.Contains(file.ContentType))
            {
                return BadRequest(new { error = "Only JPEG, PNG and WEBP avatars are allowed." });
            }

            var detectedExtension = await DetectAvatarExtensionAsync(file);
            if (detectedExtension == null)
            {
                return BadRequest(new { error = "Unsupported avatar file format." });
            }

            try
            {
                var fileName = $"space-{workspaceId}-{Guid.NewGuid():N}{detectedExtension}";
                var webRoot = string.IsNullOrWhiteSpace(_environment.WebRootPath)
                    ? Path.Combine(_environment.ContentRootPath, "wwwroot")
                    : _environment.WebRootPath;
                var folder = Path.Combine(webRoot, "uploads", "spaces");
                Directory.CreateDirectory(folder);

                var fullPath = Path.Combine(folder, fileName);
                await using (var stream = System.IO.File.Create(fullPath))
                {
                    await file.CopyToAsync(stream);
                }

                var avatarPath = $"/uploads/spaces/{fileName}";
                var updated = await _workspaceService.SetAvatarAsync(actorUserId.Value, workspaceId, avatarPath);
                return Ok(updated);
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        private static async Task<string?> DetectAvatarExtensionAsync(IFormFile file)
        {
            await using var stream = file.OpenReadStream();
            var header = new byte[12];
            var read = await stream.ReadAsync(header.AsMemory(0, header.Length));

            if (read >= 3
                && header[0] == 0xFF
                && header[1] == 0xD8
                && header[2] == 0xFF)
            {
                return ".jpg";
            }

            if (read >= 8
                && header[0] == 0x89
                && header[1] == 0x50
                && header[2] == 0x4E
                && header[3] == 0x47
                && header[4] == 0x0D
                && header[5] == 0x0A
                && header[6] == 0x1A
                && header[7] == 0x0A)
            {
                return ".png";
            }

            if (read >= 12
                && header[0] == 0x52
                && header[1] == 0x49
                && header[2] == 0x46
                && header[3] == 0x46
                && header[8] == 0x57
                && header[9] == 0x45
                && header[10] == 0x42
                && header[11] == 0x50)
            {
                return ".webp";
            }

            return null;
        }

        [HttpDelete("{workspaceId:int}/avatar")]
        public async Task<ActionResult<WorkspaceDto>> ClearSpaceAvatar(int workspaceId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            try
            {
                var updated = await _workspaceService.ClearAvatarAsync(actorUserId.Value, workspaceId);
                return Ok(updated);
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

        [HttpGet("{workspaceId:int}/members")]
        public async Task<ActionResult<IEnumerable<WorkspaceMemberDto>>> GetMembers(int workspaceId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            try
            {
                var members = await _workspaceService.GetMembersAsync(actorUserId.Value, workspaceId);
                return Ok(members);
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
        }

        [HttpPost("{workspaceId:int}/members")]
        public async Task<ActionResult<WorkspaceMemberDto>> AddMember(int workspaceId, [FromBody] AddWorkspaceMemberDto dto)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            try
            {
                var member = await _workspaceService.AddMemberAsync(actorUserId.Value, workspaceId, dto);
                return Ok(member);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }

        [HttpDelete("{workspaceId:int}/members/{userId:int}")]
        public async Task<IActionResult> RemoveMember(int workspaceId, int userId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Actor user id is required" });
            }

            try
            {
                await _workspaceService.RemoveMemberAsync(actorUserId.Value, workspaceId, userId);
                return NoContent();
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (NotFoundException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (ForbiddenException ex)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
        }
    }
}
