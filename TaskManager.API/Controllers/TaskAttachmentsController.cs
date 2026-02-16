using System.IO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TaskManager.API.Security;
using TaskManager.Application.Attachments;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;

namespace TaskManager.API.Controllers
{
    [ApiController]
    [Route("api/tasks/{taskId:int}/attachments")]
    [Authorize]
    public class TaskAttachmentsController : ControllerBase
    {
        private readonly ITaskAttachmentService _attachmentService;

        public TaskAttachmentsController(ITaskAttachmentService attachmentService)
        {
            _attachmentService = attachmentService;
        }

        private TaskAttachmentDto ToDto(AttachmentMeta meta)
        {
            return new TaskAttachmentDto
            {
                Id = meta.Id,
                TaskId = meta.TaskId,
                FileName = meta.FileName,
                ContentType = meta.ContentType,
                Size = meta.Size,
                UploadedAtUtc = meta.UploadedAtUtc,
                DownloadUrl = Url.Action(nameof(DownloadAttachment), new { taskId = meta.TaskId, attachmentId = meta.Id }) ?? string.Empty
            };
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<TaskAttachmentDto>>> ListAttachments(int taskId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue) return Unauthorized(new { error = "Actor user id is required" });

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue) return BadRequest(new { error = "Workspace id is required" });

            try
            {
                var items = await _attachmentService.ListAsync(workspaceId.Value, actorUserId.Value, taskId);
                var result = items.Select(ToDto).ToList();
                return Ok(result);
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

        [HttpGet("exists")]
        public async Task<ActionResult<object>> HasAttachments(int taskId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue) return Unauthorized(new { error = "Actor user id is required" });

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue) return BadRequest(new { error = "Workspace id is required" });

            try
            {
                var count = await _attachmentService.CountAsync(workspaceId.Value, actorUserId.Value, taskId);
                return Ok(new { hasAttachments = count > 0, count });
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

        [HttpPost]
        [RequestSizeLimit(50L * 1024 * 1024)]
        public async Task<ActionResult<IEnumerable<TaskAttachmentDto>>> UploadAttachments(int taskId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue) return Unauthorized(new { error = "Actor user id is required" });

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue) return BadRequest(new { error = "Workspace id is required" });

            if (!Request.HasFormContentType)
            {
                return BadRequest(new { error = "Expected multipart/form-data" });
            }

            var files = Request.Form.Files;
            if (files == null || files.Count == 0)
            {
                return BadRequest(new { error = "No files uploaded" });
            }

            var uploads = new List<AttachmentUpload>();
            var streams = new List<Stream>();

            foreach (var file in files)
            {
                if (file == null || file.Length <= 0) continue;
                var stream = file.OpenReadStream();
                streams.Add(stream);
                uploads.Add(new AttachmentUpload(
                    Path.GetFileName(file.FileName ?? "file"),
                    file.ContentType ?? "application/octet-stream",
                    file.Length,
                    stream));
            }

            if (uploads.Count == 0)
            {
                foreach (var stream in streams)
                {
                    stream.Dispose();
                }
                return BadRequest(new { error = "No files uploaded" });
            }

            try
            {
                var created = await _attachmentService.UploadAsync(workspaceId.Value, actorUserId.Value, taskId, uploads);
                return Ok(created.Select(ToDto).ToList());
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
            finally
            {
                foreach (var stream in streams)
                {
                    stream.Dispose();
                }
            }
        }

        [HttpGet("{attachmentId}")]
        public async Task<IActionResult> DownloadAttachment(int taskId, string attachmentId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue) return Unauthorized(new { error = "Actor user id is required" });

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue) return BadRequest(new { error = "Workspace id is required" });

            try
            {
                var content = await _attachmentService.DownloadAsync(workspaceId.Value, actorUserId.Value, taskId, attachmentId);
                return File(content.Content, content.Meta.ContentType, content.Meta.FileName);
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

        [HttpDelete("{attachmentId}")]
        public async Task<IActionResult> DeleteAttachment(int taskId, string attachmentId)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue) return Unauthorized(new { error = "Actor user id is required" });

            var workspaceId = RequestContextResolver.ResolveWorkspaceId(HttpContext);
            if (!workspaceId.HasValue) return BadRequest(new { error = "Workspace id is required" });

            try
            {
                await _attachmentService.DeleteAsync(workspaceId.Value, actorUserId.Value, taskId, attachmentId);
                return NoContent();
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
