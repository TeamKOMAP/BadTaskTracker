using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using TaskManager.Application.Interfaces;

namespace TaskManager.API.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly IChatRoomMemberRepository _memberRepository;

    public ChatHub(IChatRoomMemberRepository memberRepository)
    {
        _memberRepository = memberRepository;
    }

    public async Task JoinChat(Guid chatId)
    {
        var userId = ResolveUserId(Context.User);
        if (!userId.HasValue)
        {
            throw new HubException("Unauthorized");
        }

        var isMember = await _memberRepository.IsMemberAsync(chatId, userId.Value, Context.ConnectionAborted);
        if (!isMember)
        {
            throw new HubException("Forbidden");
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, BuildGroupName(chatId));
    }

    public Task LeaveChat(Guid chatId)
    {
        return Groups.RemoveFromGroupAsync(Context.ConnectionId, BuildGroupName(chatId));
    }

    public static string BuildGroupName(Guid chatId)
    {
        return $"chat:{chatId:N}";
    }

    private static int? ResolveUserId(ClaimsPrincipal? user)
    {
        if (user?.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var claimValue =
            user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub")
            ?? user.FindFirstValue("user_id");

        return int.TryParse(claimValue, out var userId) && userId > 0
            ? userId
            : null;
    }
}
