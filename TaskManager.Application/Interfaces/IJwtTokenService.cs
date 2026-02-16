using TaskManager.Domain.Entities;

namespace TaskManager.Application.Interfaces
{
    public interface IJwtTokenService
    {
        int AccessTokenLifetimeMinutes { get; }
        string CreateAccessToken(User user, int? workspaceId = null);
    }
}
