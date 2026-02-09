using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManager.Infrastructure.Data;

namespace TaskManager.API.Controllers
{
    [ApiController]
    [Route("api/tasks/{taskId:int}/attachments")]
    public class TaskAttachmentsController : ControllerBase
    {
        private readonly ApplicationDbContext _db;
        private readonly IWebHostEnvironment _env;

        public TaskAttachmentsController(ApplicationDbContext db, IWebHostEnvironment env)
        {
            _db = db;
            _env = env;
        }

        public sealed class TaskAttachmentDto
        {
            public string Id { get; set; } = string.Empty;
            public int TaskId { get; set; }
            public string FileName { get; set; } = string.Empty;
            public string ContentType { get; set; } = "application/octet-stream";
            public long Size { get; set; }
            public DateTime UploadedAtUtc { get; set; }
            public string DownloadUrl { get; set; } = string.Empty;
        }

        private sealed class AttachmentMeta
        {
            public string Id { get; set; } = string.Empty;
            public int TaskId { get; set; }
            public string FileName { get; set; } = string.Empty;
            public string StoredName { get; set; } = string.Empty;
            public string ContentType { get; set; } = "application/octet-stream";
            public long Size { get; set; }
            public DateTime UploadedAtUtc { get; set; }
        }

        private sealed class AttachmentIndex
        {
            public Dictionary<string, AttachmentMeta> Items { get; set; } = new();
        }

        private string GetTaskFolder(int taskId)
            => Path.Combine(_env.ContentRootPath, "App_Data", "attachments", $"task-{taskId}");

        private string GetIndexPath(int taskId)
            => Path.Combine(GetTaskFolder(taskId), "index.json");

        private async Task<AttachmentIndex> LoadIndexAsync(int taskId)
        {
            var folder = GetTaskFolder(taskId);
            Directory.CreateDirectory(folder);
            var path = GetIndexPath(taskId);
            if (!System.IO.File.Exists(path))
            {
                return new AttachmentIndex();
            }

            try
            {
                var json = await System.IO.File.ReadAllTextAsync(path);
                var index = JsonSerializer.Deserialize<AttachmentIndex>(json);
                return index ?? new AttachmentIndex();
            }
            catch
            {
                return new AttachmentIndex();
            }
        }

        private async Task SaveIndexAsync(int taskId, AttachmentIndex index)
        {
            var folder = GetTaskFolder(taskId);
            Directory.CreateDirectory(folder);
            var path = GetIndexPath(taskId);
            var json = JsonSerializer.Serialize(index, new JsonSerializerOptions
            {
                WriteIndented = true
            });
            await System.IO.File.WriteAllTextAsync(path, json);
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
            var exists = await _db.Tasks.AsNoTracking().AnyAsync(t => t.Id == taskId);
            if (!exists) return NotFound(new { error = "Task not found" });

            var index = await LoadIndexAsync(taskId);
            var result = index.Items.Values
                .OrderByDescending(x => x.UploadedAtUtc)
                .Select(ToDto)
                .ToList();

            return Ok(result);
        }

        [HttpGet("exists")]
        public async Task<ActionResult<object>> HasAttachments(int taskId)
        {
            var exists = await _db.Tasks.AsNoTracking().AnyAsync(t => t.Id == taskId);
            if (!exists) return NotFound(new { error = "Task not found" });

            var index = await LoadIndexAsync(taskId);
            var count = index.Items.Count;
            return Ok(new { hasAttachments = count > 0, count });
        }

        [HttpPost]
        [RequestSizeLimit(50L * 1024 * 1024)]
        public async Task<ActionResult<IEnumerable<TaskAttachmentDto>>> UploadAttachments(int taskId)
        {
            var exists = await _db.Tasks.AsNoTracking().AnyAsync(t => t.Id == taskId);
            if (!exists) return NotFound(new { error = "Task not found" });

            if (!Request.HasFormContentType)
            {
                return BadRequest(new { error = "Expected multipart/form-data" });
            }

            var files = Request.Form.Files;
            if (files == null || files.Count == 0)
            {
                return BadRequest(new { error = "No files uploaded" });
            }

            var folder = GetTaskFolder(taskId);
            Directory.CreateDirectory(folder);
            var index = await LoadIndexAsync(taskId);
            var created = new List<TaskAttachmentDto>();

            foreach (var file in files)
            {
                if (file == null || file.Length <= 0) continue;
                var originalName = Path.GetFileName(file.FileName ?? "file");
                if (string.IsNullOrWhiteSpace(originalName)) originalName = "file";

                var id = Guid.NewGuid().ToString("N");
                var ext = Path.GetExtension(originalName);
                var storedName = string.IsNullOrWhiteSpace(ext) ? id : (id + ext);

                var path = Path.Combine(folder, storedName);
                await using (var stream = System.IO.File.Create(path))
                {
                    await file.CopyToAsync(stream);
                }

                var meta = new AttachmentMeta
                {
                    Id = id,
                    TaskId = taskId,
                    FileName = originalName,
                    StoredName = storedName,
                    ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                    Size = file.Length,
                    UploadedAtUtc = DateTime.UtcNow
                };

                index.Items[id] = meta;
                created.Add(ToDto(meta));
            }

            await SaveIndexAsync(taskId, index);
            return Ok(created);
        }

        [HttpGet("{attachmentId}")]
        public async Task<IActionResult> DownloadAttachment(int taskId, string attachmentId)
        {
            var exists = await _db.Tasks.AsNoTracking().AnyAsync(t => t.Id == taskId);
            if (!exists) return NotFound(new { error = "Task not found" });

            var index = await LoadIndexAsync(taskId);
            if (!index.Items.TryGetValue(attachmentId, out var meta))
            {
                return NotFound(new { error = "Attachment not found" });
            }

            var path = Path.Combine(GetTaskFolder(taskId), meta.StoredName);
            if (!System.IO.File.Exists(path))
            {
                return NotFound(new { error = "Attachment file missing" });
            }

            return PhysicalFile(path, meta.ContentType, meta.FileName);
        }

        [HttpDelete("{attachmentId}")]
        public async Task<IActionResult> DeleteAttachment(int taskId, string attachmentId)
        {
            var exists = await _db.Tasks.AsNoTracking().AnyAsync(t => t.Id == taskId);
            if (!exists) return NotFound(new { error = "Task not found" });

            var index = await LoadIndexAsync(taskId);
            if (!index.Items.TryGetValue(attachmentId, out var meta))
            {
                return NotFound(new { error = "Attachment not found" });
            }

            var path = Path.Combine(GetTaskFolder(taskId), meta.StoredName);
            try
            {
                if (System.IO.File.Exists(path))
                {
                    System.IO.File.Delete(path);
                }
            }
            catch
            {
                return StatusCode(500, new { error = "Failed to delete attachment" });
            }

            index.Items.Remove(attachmentId);
            await SaveIndexAsync(taskId, index);
            return NoContent();
        }
    }
}
