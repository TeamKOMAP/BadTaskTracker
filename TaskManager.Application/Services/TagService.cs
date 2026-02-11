using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;

namespace TaskManager.Application.Services
{
    public class TagService : ITagService
    {
        private readonly ITagRepository _tagRepository;

        public TagService(ITagRepository tagRepository)
        {
            _tagRepository = tagRepository;
        }

        public async Task<IEnumerable<TagDto>> GetTagsAsync(string? query = null)
        {
            var tags = await _tagRepository.GetAllAsync(query);
            return tags.Select(MapToDto);
        }

        public async Task<TagDto> GetTagByIdAsync(int id)
        {
            var tag = await _tagRepository.GetByIdAsync(id);
            if (tag == null)
            {
                throw new NotFoundException($"Tag with id {id} not found");
            }

            return MapToDto(tag);
        }

        public async Task<(TagDto Tag, bool Created)> CreateOrGetTagAsync(CreateTagDto dto)
        {
            var name = dto.Name.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ValidationException("Tag name is required");
            }

            var existing = await _tagRepository.GetByNameAsync(name);
            if (existing != null)
            {
                return (MapToDto(existing), false);
            }

            var tag = new Tag
            {
                Name = name,
                CreatedAt = DateTime.UtcNow
            };

            var created = await _tagRepository.AddAsync(tag);
            return (MapToDto(created), true);
        }

        private static TagDto MapToDto(Tag tag)
        {
            return new TagDto
            {
                Id = tag.Id,
                Name = tag.Name,
                CreatedAt = tag.CreatedAt,
                Color = string.Empty
            };
        }
    }
}
