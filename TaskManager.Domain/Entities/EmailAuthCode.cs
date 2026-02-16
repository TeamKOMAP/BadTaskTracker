using System;
using System.ComponentModel.DataAnnotations;

namespace TaskManager.Domain.Entities
{
    public class EmailAuthCode
    {
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [MaxLength(200)]
        public string CodeHash { get; set; } = string.Empty;

        [Required]
        [MaxLength(200)]
        public string CodeSalt { get; set; } = string.Empty;

        public int AttemptsUsed { get; set; }

        public bool IsConsumed { get; set; }

        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public DateTime ExpiresAtUtc { get; set; }

        public DateTime ResendAvailableAtUtc { get; set; }

        public DateTime? ConsumedAtUtc { get; set; }
    }
}
