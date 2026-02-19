using System.ComponentModel.DataAnnotations;
using TaskManager.Domain.Enums;

namespace TaskManager.Domain.Entities
{
    public class WorkspaceInvitation
    {
        public int Id { get; set; }

        [Required]
        public int WorkspaceId { get; set; }

        [Required]
        public int InvitedByUserId { get; set; }

        public int? InvitedUserId { get; set; }

        [Required]
        [MaxLength(100)]
        [EmailAddress]
        public string InvitedEmail { get; set; } = string.Empty;

        public WorkspaceRole Role { get; set; } = WorkspaceRole.Member;

        public WorkspaceInvitationStatus Status { get; set; } = WorkspaceInvitationStatus.Pending;

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddDays(7);

        public DateTime? RespondedAtUtc { get; set; }

        public virtual Workspace Workspace { get; set; } = null!;
        public virtual User InvitedByUser { get; set; } = null!;
        public virtual User? InvitedUser { get; set; }
    }
}
