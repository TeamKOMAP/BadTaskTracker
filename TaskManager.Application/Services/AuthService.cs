using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using TaskManager.Application.Auth;
using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;

namespace TaskManager.Application.Services
{
    public class AuthService : IAuthService
    {
        private const int HashIterations = 100_000;
        private const int SaltSize = 16;
        private const int HashSize = 32;
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> EmailLocks = new(StringComparer.Ordinal);

        private readonly IUserRepository _userRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;
        private readonly IEmailAuthCodeRepository _emailAuthCodeRepository;
        private readonly IEmailSender _emailSender;
        private readonly IJwtTokenService _jwtTokenService;
        private readonly EmailAuthSettings _settings;

        public AuthService(
            IUserRepository userRepository,
            IWorkspaceMemberRepository workspaceMemberRepository,
            IEmailAuthCodeRepository emailAuthCodeRepository,
            IEmailSender emailSender,
            IJwtTokenService jwtTokenService,
            EmailAuthSettings settings)
        {
            _userRepository = userRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
            _emailAuthCodeRepository = emailAuthCodeRepository;
            _emailSender = emailSender;
            _jwtTokenService = jwtTokenService;
            _settings = settings ?? new EmailAuthSettings();
        }

        public Task<EmailCodeRequestResultDto> RequestEmailCodeAsync(EmailCodeRequestDto dto)
        {
            var email = NormalizeAndValidateEmail(dto?.Email);
            return ExecuteWithEmailLockAsync(email, () => RequestEmailCodeCoreAsync(email));
        }

        private async Task<EmailCodeRequestResultDto> RequestEmailCodeCoreAsync(string email)
        {
            var now = DateTime.UtcNow;

            var active = await _emailAuthCodeRepository.GetLatestActiveByEmailAsync(email);
            if (active != null && active.ResendAvailableAtUtc > now)
            {
                return new EmailCodeRequestResultDto
                {
                    ResendAfterSeconds = Math.Max(1, (int)Math.Ceiling((active.ResendAvailableAtUtc - now).TotalSeconds)),
                    ExpiresInSeconds = Math.Max(1, (int)Math.Ceiling((active.ExpiresAtUtc - now).TotalSeconds))
                };
            }

            await _emailAuthCodeRepository.ConsumeActiveByEmailAsync(email, now);

            var code = GenerateNumericCode(_settings.CodeLength);
            var saltBytes = RandomNumberGenerator.GetBytes(SaltSize);
            var hashBytes = ComputeHash(code, saltBytes);

            var expiresAt = now.AddMinutes(Math.Max(1, _settings.CodeLifetimeMinutes));
            var resendAt = now.AddSeconds(Math.Max(5, _settings.ResendCooldownSeconds));

            var entity = new EmailAuthCode
            {
                Email = email,
                CodeSalt = Convert.ToBase64String(saltBytes),
                CodeHash = Convert.ToBase64String(hashBytes),
                AttemptsUsed = 0,
                IsConsumed = false,
                CreatedAtUtc = now,
                ExpiresAtUtc = expiresAt,
                ResendAvailableAtUtc = resendAt,
                ConsumedAtUtc = null
            };

            await _emailAuthCodeRepository.AddAsync(entity);

            var resendAfterSeconds = Math.Max(5, _settings.ResendCooldownSeconds);
            var expiresInSeconds = Math.Max(60, _settings.CodeLifetimeMinutes * 60);

            try
            {
                await _emailSender.SendAsync(
                    email,
                    "BadTaskTracker sign-in code",
                    BuildEmailBody(code, _settings.CodeLifetimeMinutes));
            }
            catch
            {
                if (_settings.EnableDevelopmentCodeFallback)
                {
                    return new EmailCodeRequestResultDto
                    {
                        ResendAfterSeconds = resendAfterSeconds,
                        ExpiresInSeconds = expiresInSeconds,
                        DevelopmentCode = _settings.ExposeDevelopmentCodeInResponse ? code : null
                    };
                }

                entity.IsConsumed = true;
                entity.ConsumedAtUtc = now;
                await _emailAuthCodeRepository.UpdateAsync(entity);
                throw new ValidationException("Unable to send code right now. Try again later.");
            }

            return new EmailCodeRequestResultDto
            {
                ResendAfterSeconds = resendAfterSeconds,
                ExpiresInSeconds = expiresInSeconds,
                DevelopmentCode = null
            };
        }

        public Task<AuthTokenResponseDto> VerifyEmailCodeAsync(EmailCodeVerifyDto dto)
        {
            var email = NormalizeAndValidateEmail(dto?.Email);
            var code = NormalizeCode(dto?.Code);
            return ExecuteWithEmailLockAsync(email, () => VerifyEmailCodeCoreAsync(email, code));
        }

        private async Task<AuthTokenResponseDto> VerifyEmailCodeCoreAsync(string email, string code)
        {
            var now = DateTime.UtcNow;

            var active = await _emailAuthCodeRepository.GetLatestActiveByEmailAsync(email);
            if (active == null || active.ExpiresAtUtc <= now)
            {
                throw new ValidationException("Code has expired. Request a new one.");
            }

            if (active.AttemptsUsed >= Math.Max(1, _settings.MaxAttempts))
            {
                throw new ValidationException("Too many attempts. Request a new code.");
            }

            var isCodeValid = VerifyCodeHash(code, active.CodeHash, active.CodeSalt);
            if (!isCodeValid)
            {
                active.AttemptsUsed += 1;
                if (active.AttemptsUsed >= Math.Max(1, _settings.MaxAttempts))
                {
                    active.IsConsumed = true;
                    active.ConsumedAtUtc = now;
                }
                await _emailAuthCodeRepository.UpdateAsync(active);
                throw new ValidationException("Invalid code.");
            }

            active.IsConsumed = true;
            active.ConsumedAtUtc = now;
            await _emailAuthCodeRepository.UpdateAsync(active);

            var user = await _userRepository.GetByEmailAsync(email);
            if (user == null)
            {
                user = await _userRepository.AddAsync(new User
                {
                    Name = BuildDefaultNameFromEmail(email),
                    Email = email,
                    CreatedAt = now
                });
            }

            var token = _jwtTokenService.CreateAccessToken(user);
            return MapTokenResponse(user, token, null);
        }

        private static async Task<T> ExecuteWithEmailLockAsync<T>(string email, Func<Task<T>> action)
        {
            var key = email ?? string.Empty;
            var gate = EmailLocks.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync();

            try
            {
                return await action();
            }
            finally
            {
                gate.Release();
            }
        }

        public async Task<AuthTokenResponseDto> SwitchWorkspaceAsync(int actorUserId, SwitchWorkspaceRequestDto dto)
        {
            if (actorUserId <= 0)
            {
                throw new ForbiddenException("Access denied");
            }

            var workspaceId = dto?.WorkspaceId ?? 0;
            if (workspaceId <= 0)
            {
                throw new ValidationException("Workspace id is required");
            }

            var member = await _workspaceMemberRepository.GetMemberAsync(workspaceId, actorUserId);
            if (member == null)
            {
                throw new ForbiddenException("Access denied");
            }

            var user = await _userRepository.GetByIdAsync(actorUserId);
            if (user == null)
            {
                throw new NotFoundException("User not found");
            }

            var token = _jwtTokenService.CreateAccessToken(user, workspaceId);
            return MapTokenResponse(user, token, workspaceId);
        }

        public async Task<AuthUserDto> GetCurrentUserAsync(int actorUserId)
        {
            if (actorUserId <= 0)
            {
                throw new ForbiddenException("Access denied");
            }

            var user = await _userRepository.GetByIdAsync(actorUserId);
            if (user == null)
            {
                throw new NotFoundException("User not found");
            }

            return new AuthUserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email
            };
        }

        private AuthTokenResponseDto MapTokenResponse(User user, string token, int? workspaceId)
        {
            return new AuthTokenResponseDto
            {
                AccessToken = token,
                TokenType = "Bearer",
                ExpiresInSeconds = Math.Max(60, _jwtTokenService.AccessTokenLifetimeMinutes * 60),
                WorkspaceId = workspaceId,
                User = new AuthUserDto
                {
                    Id = user.Id,
                    Name = user.Name,
                    Email = user.Email
                }
            };
        }

        private static string BuildEmailBody(string code, int minutes)
        {
            var safeMinutes = Math.Max(1, minutes);
            return $"<p>Your BadTaskTracker code:</p><h2 style=\"letter-spacing: 0.2em;\">{code}</h2><p>This code expires in {safeMinutes} minute(s).</p>";
        }

        private static string NormalizeCode(string? rawCode)
        {
            var value = new string((rawCode ?? string.Empty).Trim().Where(char.IsDigit).ToArray());
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new ValidationException("Code is required.");
            }

            if (value.Length < 4 || value.Length > 12)
            {
                throw new ValidationException("Code format is invalid.");
            }

            return value;
        }

        private static string NormalizeAndValidateEmail(string? rawEmail)
        {
            var email = (rawEmail ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email))
            {
                throw new ValidationException("Email is required.");
            }

            if (email.Length > 100)
            {
                throw new ValidationException("Email is too long.");
            }

            try
            {
                _ = new MailAddress(email);
            }
            catch
            {
                throw new ValidationException("Email is invalid.");
            }

            return email;
        }

        private static string BuildDefaultNameFromEmail(string email)
        {
            var local = email.Split('@')[0];
            if (string.IsNullOrWhiteSpace(local))
            {
                return "User";
            }

            var clean = local.Replace('.', ' ').Replace('_', ' ').Replace('-', ' ');
            var words = clean
                .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Select(word => char.ToUpperInvariant(word[0]) + word[1..].ToLowerInvariant())
                .ToList();

            var name = string.Join(" ", words);
            if (string.IsNullOrWhiteSpace(name))
            {
                name = local;
            }

            if (name.Length > 100)
            {
                name = name[..100];
            }

            return name;
        }

        private static string GenerateNumericCode(int length)
        {
            var safeLength = Math.Clamp(length, 4, 8);
            var buffer = new StringBuilder(safeLength);
            for (var i = 0; i < safeLength; i++)
            {
                var digit = RandomNumberGenerator.GetInt32(0, 10);
                buffer.Append(digit.ToString(CultureInfo.InvariantCulture));
            }

            return buffer.ToString();
        }

        private static byte[] ComputeHash(string code, byte[] salt)
        {
            return Rfc2898DeriveBytes.Pbkdf2(
                code,
                salt,
                HashIterations,
                HashAlgorithmName.SHA256,
                HashSize);
        }

        private static bool VerifyCodeHash(string code, string hashBase64, string saltBase64)
        {
            if (string.IsNullOrWhiteSpace(hashBase64) || string.IsNullOrWhiteSpace(saltBase64))
            {
                return false;
            }

            byte[] expectedHash;
            byte[] salt;
            try
            {
                expectedHash = Convert.FromBase64String(hashBase64);
                salt = Convert.FromBase64String(saltBase64);
            }
            catch
            {
                return false;
            }

            var actualHash = ComputeHash(code, salt);
            return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
        }
    }
}
