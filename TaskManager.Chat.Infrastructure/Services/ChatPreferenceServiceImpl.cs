using Microsoft.EntityFrameworkCore;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Application.Services;
using TaskManager.Domain.Entities;
using TaskManager.Infrastructure.Data;

namespace TaskManager.Chat.Infrastructure.Services;

public sealed class ChatPreferenceServiceImpl : IChatPreferenceService
{
    private readonly IChatRepository _chatRepository;
    private readonly IChatRoomMemberRepository _memberRepository;
    private readonly ApplicationDbContext _dbContext;

    public ChatPreferenceServiceImpl(
        IChatRepository chatRepository,
        IChatRoomMemberRepository memberRepository,
        ApplicationDbContext dbContext)
    {
        _chatRepository = chatRepository;
        _memberRepository = memberRepository;
        _dbContext = dbContext;
    }

    public async Task<ChatPreferenceDto> GetAsync(Guid chatId, int userId, CancellationToken ct = default)
    {
        await EnsureMembershipAsync(chatId, userId, ct);

        var preference = await _dbContext.ChatUserPreferences
            .FirstOrDefaultAsync(p => p.ChatRoomId == chatId && p.UserId == userId, ct);

        return MapToDto(chatId, preference);
    }

    public async Task<ChatPreferenceDto> UpdateAsync(Guid chatId, int userId, UpdateChatPreferenceRequest request, CancellationToken ct = default)
    {
        await EnsureMembershipAsync(chatId, userId, ct);

        var preference = await _dbContext.ChatUserPreferences
            .FirstOrDefaultAsync(p => p.ChatRoomId == chatId && p.UserId == userId, ct);

        if (preference == null)
        {
            preference = new ChatUserPreferences
            {
                ChatRoomId = chatId,
                UserId = userId,
                IsMuted = request.IsMuted ?? false,
                SoundEnabled = request.SoundEnabled ?? true,
                BackgroundImageKey = NormalizeBackgroundKey(request.BackgroundImageKey),
                UpdatedAtUtc = DateTime.UtcNow
            };
            _dbContext.ChatUserPreferences.Add(preference);
        }
        else
        {
            if (request.IsMuted.HasValue)
            {
                preference.IsMuted = request.IsMuted.Value;
            }

            if (request.SoundEnabled.HasValue)
            {
                preference.SoundEnabled = request.SoundEnabled.Value;
            }

            if (request.BackgroundImageKey != null || string.IsNullOrWhiteSpace(request.BackgroundImageKey))
            {
                preference.BackgroundImageKey = NormalizeBackgroundKey(request.BackgroundImageKey);
            }

            preference.UpdatedAtUtc = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(ct);
        return MapToDto(chatId, preference);
    }

    private async Task EnsureMembershipAsync(Guid chatId, int userId, CancellationToken ct)
    {
        var chat = await _chatRepository.GetByIdAsync(chatId, ct);
        if (chat == null)
        {
            throw new NotFoundException("Chat not found");
        }

        var isMember = await _memberRepository.IsMemberAsync(chatId, userId, ct);
        if (!isMember)
        {
            throw new ForbiddenException("User is not a member of this chat");
        }
    }

    private static ChatPreferenceDto MapToDto(Guid chatId, ChatUserPreferences? preference)
    {
        return new ChatPreferenceDto
        {
            ChatId = chatId,
            IsMuted = preference?.IsMuted ?? false,
            SoundEnabled = preference?.SoundEnabled ?? true,
            BackgroundImageKey = preference?.BackgroundImageKey
        };
    }

    private static string? NormalizeBackgroundKey(string? value)
    {
        var normalized = string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        if (normalized != null && normalized.Length > 500)
        {
            throw new ValidationException("Background key exceeds max length of 500 characters.");
        }

        return normalized;
    }
}
