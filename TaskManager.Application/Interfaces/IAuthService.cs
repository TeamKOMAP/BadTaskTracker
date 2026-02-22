using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface IAuthService
    {
        Task<EmailCodeRequestResultDto> RequestEmailCodeAsync(EmailCodeRequestDto dto);
        Task<AuthTokenResponseDto> VerifyEmailCodeAsync(EmailCodeVerifyDto dto);
        Task<AuthTokenResponseDto> SwitchWorkspaceAsync(int actorUserId, SwitchWorkspaceRequestDto dto);
        Task<AuthUserDto> GetCurrentUserAsync(int actorUserId);
        Task<AuthUserDto> UpdateTimeZoneAsync(int actorUserId, string timeZoneId);
        Task<AuthUserDto> UpdateNicknameAsync(int actorUserId, string nickname);
        Task<string?> GetAvatarObjectKeyAsync(int actorUserId);
        Task<AuthUserDto> SetAvatarAsync(int actorUserId, string avatarPath, string avatarObjectKey);
        Task<AuthUserDto> ClearAvatarAsync(int actorUserId);
    }
}
