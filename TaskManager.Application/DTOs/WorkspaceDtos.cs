using System.ComponentModel.DataAnnotations;
using TaskManager.Domain.Enums;

namespace TaskManager.Application.DTOs
{
    public class WorkspaceDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? AvatarPath { get; set; }
        public int CreatedByUserId { get; set; }
        public string CreatedByUserName { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
        public WorkspaceRole CurrentUserRole { get; set; } = WorkspaceRole.Member;
        public int MemberCount { get; set; }
    }

    public class CreateWorkspaceDto
    {
        [Required]
        [StringLength(120, MinimumLength = 2)]
        public string Name { get; set; } = string.Empty;
    }

    public class UpdateWorkspaceDto
    {
        [Required]
        [StringLength(120, MinimumLength = 2)]
        public string Name { get; set; } = string.Empty;
    }

    public class WorkspaceMemberDto
    {
        public int UserId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? AvatarPath { get; set; }
        public WorkspaceRole Role { get; set; } = WorkspaceRole.Member;
        public DateTime AddedAt { get; set; }
        public int TaskCount { get; set; }
    }

    public class AddWorkspaceMemberDto
    {
        public int? UserId { get; set; }

        [EmailAddress]
        [StringLength(100)]
        public string? Email { get; set; }

        [StringLength(100)]
        public string? Name { get; set; }

        public WorkspaceRole Role { get; set; } = WorkspaceRole.Member;
    }
}
