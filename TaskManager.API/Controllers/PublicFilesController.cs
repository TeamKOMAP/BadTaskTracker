using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;

namespace TaskManager.API.Controllers
{
    [ApiController]
    [Route("api/public-files")]
    public class PublicFilesController : ControllerBase
    {
        private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

        private readonly IObjectStorage _objectStorage;
        private readonly StorageSettings _storageSettings;

        public PublicFilesController(IObjectStorage objectStorage, StorageSettings storageSettings)
        {
            _objectStorage = objectStorage;
            _storageSettings = storageSettings;
        }

        [AllowAnonymous]
        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] string? key)
        {
            var objectKey = (key ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(objectKey))
            {
                return NotFound();
            }

            var stream = await _objectStorage.OpenReadAsync(_storageSettings.PublicBucket, objectKey);
            if (stream == null)
            {
                return NotFound();
            }

            var contentType = ContentTypeProvider.TryGetContentType(objectKey, out var detected)
                ? detected
                : "application/octet-stream";

            return File(stream, contentType, enableRangeProcessing: true);
        }
    }
}
