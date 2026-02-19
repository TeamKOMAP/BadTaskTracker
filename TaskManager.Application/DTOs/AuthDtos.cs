using System.ComponentModel.DataAnnotations;

namespace TaskManager.Application.DTOs
{
    public class EmailCodeRequestDto
    {
        [Required]
        [EmailAddress]
        [StringLength(100)]
        public string Email { get; set; } = string.Empty;
    }

    public class EmailCodeVerifyDto
    {
        [Required]
        [EmailAddress]
        [StringLength(100)]
        public string Email { get; set; } = string.Empty;

        [Required]
        [StringLength(12, MinimumLength = 4)]
        public string Code { get; set; } = string.Empty;
    }

    public class SwitchWorkspaceRequestDto
    {
        [Required]
        public int WorkspaceId { get; set; }
    }

    public class UpdateTimeZoneDto
    {
        [Required]
        [StringLength(100)]
        public string TimeZoneId { get; set; } = "UTC";
    }

    public class EmailCodeRequestResultDto
    {
        public int ResendAfterSeconds { get; set; }
        public int ExpiresInSeconds { get; set; }
        public string? DevelopmentCode { get; set; }
    }

    public class AuthUserDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string TimeZoneId { get; set; } = "UTC";
    }

    public class AuthTokenResponseDto
    {
        public string AccessToken { get; set; } = string.Empty;
        public string TokenType { get; set; } = "Bearer";
        public int ExpiresInSeconds { get; set; }
        public int? WorkspaceId { get; set; }
        public AuthUserDto User { get; set; } = new();
    }
}
