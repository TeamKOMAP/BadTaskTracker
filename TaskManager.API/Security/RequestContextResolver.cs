using System.Security.Claims;

namespace TaskManager.API.Security
{
    public static class RequestContextResolver
    {
        public static int? ResolveActorUserId(HttpContext httpContext)
        {
            var user = httpContext.User;
            if (user?.Identity?.IsAuthenticated != true)
            {
                return null;
            }

            var claimValue =
                user.FindFirstValue(ClaimTypes.NameIdentifier) ??
                user.FindFirstValue("sub") ??
                user.FindFirstValue("user_id");

            if (int.TryParse(claimValue, out var claimUserId) && claimUserId > 0)
            {
                return claimUserId;
            }

            return null;
        }

        public static int? ResolveWorkspaceId(HttpContext httpContext)
        {
            var routeValue = httpContext.Request.RouteValues.TryGetValue("workspaceId", out var routeRaw)
                ? Convert.ToString(routeRaw)
                : null;

            if (int.TryParse(routeValue, out var routeWorkspaceId) && routeWorkspaceId > 0)
            {
                return routeWorkspaceId;
            }

            var user = httpContext.User;
            if (user?.Identity?.IsAuthenticated == true)
            {
                var claimValue = user.FindFirstValue("workspace_id");
                if (int.TryParse(claimValue, out var claimWorkspaceId) && claimWorkspaceId > 0)
                {
                    return claimWorkspaceId;
                }
            }

            return null;
        }
    }
}
