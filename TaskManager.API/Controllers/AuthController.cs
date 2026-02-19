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
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly IAuthService _authService;

        public AuthController(IAuthService authService)
        {
            _authService = authService;
        }

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
