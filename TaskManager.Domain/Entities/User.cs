using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class User
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string TimeZoneId { get; set; } = "UTC";

        [MaxLength(400)]
        public string? AvatarPath { get; set; }

        [MaxLength(500)]
        public string? AvatarObjectKey { get; set; }

        public DateTime? NicknameChangedAtUtc { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public virtual ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
        public virtual ICollection<WorkspaceMember> WorkspaceMemberships { get; set; } = new List<WorkspaceMember>();
        public virtual ICollection<Workspace> OwnedWorkspaces { get; set; } = new List<Workspace>();
    }
}
