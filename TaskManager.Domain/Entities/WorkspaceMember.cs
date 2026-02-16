using TaskManager.Domain.Enums;

namespace TaskManager.Domain.Entities
{
    public class WorkspaceMember
    {
        public int WorkspaceId { get; set; }
        public int UserId { get; set; }
        public WorkspaceRole Role { get; set; } = WorkspaceRole.Member;
        public DateTime AddedAt { get; set; } = DateTime.UtcNow;

        public virtual Workspace Workspace { get; set; } = null!;
        public virtual User User { get; set; } = null!;
    }
}
