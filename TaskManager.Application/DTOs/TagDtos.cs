using System.ComponentModel.DataAnnotations;

namespace TaskManager.Application.DTOs
{
    public class TagDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Color { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; }
    }

    public class CreateTagDto
    {
        [Required]
        [StringLength(50)]
        public string Name { get; set; } = string.Empty;

        [StringLength(20)]
        public string Color { get; set; } = "#007bff";
    }

    public class UpdateTagDto
    {
        public int Id { get; set; }

        [Required]
        [StringLength(50)]
        public string Name { get; set; } = string.Empty;

        [StringLength(20)]
        public string Color { get; set; } = string.Empty;
    }
}