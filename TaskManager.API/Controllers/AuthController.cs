using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TaskManager.API.Security;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Storage;
using TimeZoneConverter;

namespace TaskManager.API.Controllers
{
    /// <summary>
    /// Controller for authentication and user management.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private const long MaxAvatarSizeBytes = 5L * 1024 * 1024;
        private static readonly HashSet<string> AllowedAvatarContentTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "image/jpeg",
            "image/png",
            "image/webp"
        };

        private readonly IAuthService _authService;
        private readonly IObjectStorage _objectStorage;
        private readonly StorageSettings _storageSettings;

        /// <summary>
        /// Initializes a new instance of the AuthController.
        /// </summary>
        /// <param name="authService">The authentication service.</param>
        /// <param name="objectStorage">The object storage service.</param>
        /// <param name="storageSettings">The storage settings.</param>
        public AuthController(
            IAuthService authService,
            IObjectStorage objectStorage,
            StorageSettings storageSettings)
        {
            _authService = authService;
            _objectStorage = objectStorage;
            _storageSettings = storageSettings;
        }

        /// <summary>
        /// Requests an email authentication code.
        /// </summary>
        /// <param name="dto">The email request data.</param>
        /// <returns>Result with code expiration info.</returns>
        /// <response code="200">Code sent successfully</response>
        /// <response code="400">If email is invalid</response>
        [AllowAnonymous]
        [EnableRateLimiting("AuthEmailRequest")]
        [HttpPost("email/request")]
        public async Task<ActionResult<EmailCodeRequestResultDto>> RequestEmailCode([FromBody] EmailCodeRequestDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            try
            {
                var result = await _authService.RequestEmailCodeAsync(dto);
                return Ok(result);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        /// <summary>
        /// Verifies the email authentication code and returns a JWT token.
        /// </summary>
        /// <param name="dto">The verification data with email and code.</param>
        /// <returns>JWT token for authenticated user.</returns>
        /// <response code="200">Verification successful, token returned</response>
        /// <response code="400">If code is invalid or expired</response>
        [AllowAnonymous]
        [EnableRateLimiting("AuthEmailVerify")]
        [HttpPost("email/verify")]
        public async Task<ActionResult<AuthTokenResponseDto>> VerifyEmailCode([FromBody] EmailCodeVerifyDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            try
            {
                var token = await _authService.VerifyEmailCodeAsync(dto);
                return Ok(token);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        /// <summary>
        /// Gets the current authenticated user information.
        /// </summary>
        /// <returns>The current user details.</returns>
        /// <response code="200">Returns user information</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="404">If user is not found</response>
        [Authorize]
        [HttpGet("me")]
        public async Task<ActionResult<AuthUserDto>> Me()
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Authenticated user claim is missing" });
            }

            try
            {
                var user = await _authService.GetCurrentUserAsync(actorUserId.Value);
                return Ok(user);
            }
            catch (NotFoundException)
            {
                return NotFound();
            }
        }

        /// <summary>
        /// Switches to a different workspace and returns a new JWT token.
        /// </summary>
        /// <param name="dto">The workspace switch request.</param>
        /// <returns>New JWT token with updated workspace context.</returns>
        /// <response code="200">Workspace switched successfully</response>
        /// <response code="400">If workspace ID is invalid</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If user is not a member of the workspace</response>
        /// <response code="404">If workspace is not found</response>
        [Authorize]
        [HttpPost("switch-workspace")]
        public async Task<ActionResult<AuthTokenResponseDto>> SwitchWorkspace([FromBody] SwitchWorkspaceRequestDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Authenticated user claim is missing" });
            }

            try
            {
                var token = await _authService.SwitchWorkspaceAsync(actorUserId.Value, dto);
                return Ok(token);
            }
            catch (ValidationException ex)
            {
                return BadRequest(new { error = ex.Message });
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

        /// <summary>
        /// Updates the user's timezone preference.
        /// </summary>
        /// <param name="dto">The timezone update request.</param>
        /// <returns>Updated user information.</returns>
        /// <response code="200">Timezone updated successfully</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If access is denied</response>
        /// <response code="404">If user is not found</response>
        [Authorize]
        [HttpPost("timezone")]
        public async Task<ActionResult<AuthUserDto>> UpdateTimeZone([FromBody] UpdateTimeZoneDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Authenticated user claim is missing" });
            }

            try
            {
                var normalizedTimeZoneId = NormalizeTimeZoneId(dto.TimeZoneId);
                var user = await _authService.UpdateTimeZoneAsync(actorUserId.Value, normalizedTimeZoneId);
                return Ok(user);
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

        /// <summary>
        /// Updates the user's nickname.
        /// </summary>
        /// <param name="dto">The nickname update request.</param>
        /// <returns>Updated user information.</returns>
        /// <response code="200">Nickname updated successfully</response>
        /// <response code="400">If nickname is invalid or cooldown is active</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If access is denied</response>
        /// <response code="404">If user is not found</response>
        [Authorize]
        [HttpPost("nickname")]
        public async Task<ActionResult<AuthUserDto>> UpdateNickname([FromBody] UpdateNicknameDto dto)
        {
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }

            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Authenticated user claim is missing" });
            }

            try
            {
                var user = await _authService.UpdateNicknameAsync(actorUserId.Value, dto.Nickname);
                return Ok(user);
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

        /// <summary>
        /// Sets or updates the user's avatar image.
        /// </summary>
        /// <param name="file">The avatar image file (JPEG, PNG, or WEBP, max 5MB).</param>
        /// <returns>Updated user information.</returns>
        /// <response code="200">Avatar updated successfully</response>
        /// <response code="400">If file is invalid</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If access is denied</response>
        /// <response code="404">If user is not found</response>
        [Authorize]
        [HttpPost("avatar")]
        [RequestSizeLimit(MaxAvatarSizeBytes)]
        public async Task<ActionResult<AuthUserDto>> SetAvatar(IFormFile? file)
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Authenticated user claim is missing" });
            }

            if (file == null || file.Length <= 0)
            {
                return BadRequest(new { error = "Avatar file is required." });
            }

            if (file.Length > MaxAvatarSizeBytes)
            {
                return BadRequest(new { error = "Avatar file is too large. Maximum size is 5MB." });
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

            string? uploadedObjectKey = null;

            try
            {
                var oldObjectKey = await _authService.GetAvatarObjectKeyAsync(actorUserId.Value);
                var objectKey = $"avatars/users/user-{actorUserId.Value}/{Guid.NewGuid():N}{detectedExtension}";

                await using var stream = file.OpenReadStream();
                await _objectStorage.UploadAsync(
                    _storageSettings.PublicBucket,
                    objectKey,
                    stream,
                    ResolveAvatarContentType(detectedExtension));
                uploadedObjectKey = objectKey;

                var avatarPath = BuildPublicFileUrl(objectKey);
                var updated = await _authService.SetAvatarAsync(actorUserId.Value, avatarPath, objectKey);

                if (!string.IsNullOrWhiteSpace(oldObjectKey)
                    && !string.Equals(oldObjectKey, objectKey, StringComparison.Ordinal))
                {
                    await _objectStorage.DeleteAsync(_storageSettings.PublicBucket, oldObjectKey);
                }

                return Ok(updated);
            }
            catch (NotFoundException ex)
            {
                if (!string.IsNullOrWhiteSpace(uploadedObjectKey))
                {
                    await _objectStorage.DeleteAsync(_storageSettings.PublicBucket, uploadedObjectKey);
                }
                return NotFound(new { error = ex.Message });
            }
            catch (ForbiddenException ex)
            {
                if (!string.IsNullOrWhiteSpace(uploadedObjectKey))
                {
                    await _objectStorage.DeleteAsync(_storageSettings.PublicBucket, uploadedObjectKey);
                }
                return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
            }
            catch (ValidationException ex)
            {
                if (!string.IsNullOrWhiteSpace(uploadedObjectKey))
                {
                    await _objectStorage.DeleteAsync(_storageSettings.PublicBucket, uploadedObjectKey);
                }
                return BadRequest(new { error = ex.Message });
            }
        }

        /// <summary>
        /// Clears the user's avatar.
        /// </summary>
        /// <returns>Updated user information.</returns>
        /// <response code="200">Avatar removed successfully</response>
        /// <response code="401">If user is not authenticated</response>
        /// <response code="403">If access is denied</response>
        /// <response code="404">If user is not found</response>
        [Authorize]
        [HttpDelete("avatar")]
        public async Task<ActionResult<AuthUserDto>> ClearAvatar()
        {
            var actorUserId = RequestContextResolver.ResolveActorUserId(HttpContext);
            if (!actorUserId.HasValue)
            {
                return Unauthorized(new { error = "Authenticated user claim is missing" });
            }

            try
            {
                var oldObjectKey = await _authService.GetAvatarObjectKeyAsync(actorUserId.Value);
                var updated = await _authService.ClearAvatarAsync(actorUserId.Value);

                if (!string.IsNullOrWhiteSpace(oldObjectKey))
                {
                    await _objectStorage.DeleteAsync(_storageSettings.PublicBucket, oldObjectKey);
                }

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
        }

        private static string NormalizeTimeZoneId(string? rawTimeZoneId)
        {
            var timeZoneId = (rawTimeZoneId ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(timeZoneId) || timeZoneId.Length > 100)
            {
                return "UTC";
            }

            try
            {
                _ = TZConvert.GetTimeZoneInfo(timeZoneId);
                return timeZoneId;
            }
            catch
            {
                return "UTC";
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

        private static string ResolveAvatarContentType(string extension)
        {
            return extension.ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".webp" => "image/webp",
                _ => "application/octet-stream"
            };
        }

        private static string BuildPublicFileUrl(string objectKey)
        {
            return $"/api/public-files?key={Uri.EscapeDataString(objectKey)}";
        }
    }
}
