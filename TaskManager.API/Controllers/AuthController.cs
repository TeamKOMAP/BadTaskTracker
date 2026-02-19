using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TaskManager.API.Security;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
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
        private readonly IAuthService _authService;

        /// <summary>
        /// Initializes a new instance of the AuthController.
        /// </summary>
        /// <param name="authService">The authentication service.</param>
        public AuthController(IAuthService authService)
        {
            _authService = authService;
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
    }
}
