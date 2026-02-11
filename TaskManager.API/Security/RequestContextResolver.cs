using System.Security.Claims;

namespace TaskManager.API.Security
{
    public static class RequestContextResolver
    {
        public static int? ResolveActorUserId(HttpContext httpContext)
        {
            var user = httpContext.User;
            if (user?.Identity?.IsAuthenticated == true)
            {
                var claimValue =
                    user.FindFirstValue(ClaimTypes.NameIdentifier) ??
                    user.FindFirstValue("sub") ??
                    user.FindFirstValue("user_id");

                if (int.TryParse(claimValue, out var claimUserId) && claimUserId > 0)
                {
                    return claimUserId;
                }
            }

            var headerValue = httpContext.Request.Headers["X-Actor-UserId"].FirstOrDefault();
            if (int.TryParse(headerValue, out var headerUserId) && headerUserId > 0)
            {
                return headerUserId;
            }

            var queryValue = httpContext.Request.Query["actorUserId"].FirstOrDefault();
            if (int.TryParse(queryValue, out var queryUserId) && queryUserId > 0)
            {
                return queryUserId;
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

            var headerValue = httpContext.Request.Headers["X-Workspace-Id"].FirstOrDefault();
            if (int.TryParse(headerValue, out var headerWorkspaceId) && headerWorkspaceId > 0)
            {
                return headerWorkspaceId;
            }

            var queryValue = httpContext.Request.Query["workspaceId"].FirstOrDefault();
            if (int.TryParse(queryValue, out var queryWorkspaceId) && queryWorkspaceId > 0)
            {
                return queryWorkspaceId;
            }

            return null;
        }
    }
}
