using System.ComponentModel.DataAnnotations;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.DTOs
{
    public class CreateWorkspaceInvitationDto
    {
        [Required]
        [EmailAddress]
        [StringLength(100)]
        public string Email { get; set; } = string.Empty;

        public WorkspaceRole Role { get; set; } = WorkspaceRole.Member;
    }

    public class WorkspaceInvitationDto
    {
        public int Id { get; set; }
        public int WorkspaceId { get; set; }
        public string WorkspaceName { get; set; } = string.Empty;
        public int InvitedByUserId { get; set; }
        public string InvitedByName { get; set; } = string.Empty;
        public string InvitedByEmail { get; set; } = string.Empty;
        public string InvitedEmail { get; set; } = string.Empty;
        public WorkspaceRole Role { get; set; }
        public WorkspaceInvitationStatus Status { get; set; }
        public DateTime CreatedAtUtc { get; set; }
        public DateTime ExpiresAtUtc { get; set; }
        public DateTime? RespondedAtUtc { get; set; }
        public bool CanRespond { get; set; }
        public bool IsExpired { get; set; }
    }
}
