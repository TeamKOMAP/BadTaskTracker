using TaskManager.Application.DTOs;
using TaskManager.Application.Exceptions;
using TaskManager.Application.Interfaces;
using TaskManager.Domain.Entities;

namespace TaskManager.Application.Services
{
    public class TagService : ITagService
    {
        private readonly ITagRepository _tagRepository;
        private readonly IWorkspaceMemberRepository _workspaceMemberRepository;

        public TagService(ITagRepository tagRepository, IWorkspaceMemberRepository workspaceMemberRepository)
        {
            _tagRepository = tagRepository;
            _workspaceMemberRepository = workspaceMemberRepository;
        }

        public async Task<IEnumerable<TagDto>> GetTagsAsync(int workspaceId, int actorUserId, string? query = null)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            var tags = await _tagRepository.GetAllAsync(workspaceId, query);
            return tags.Select(MapToDto);
        }

        public async Task<TagDto> GetTagByIdAsync(int workspaceId, int actorUserId, int id)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            var tag = await _tagRepository.GetByIdAsync(workspaceId, id);
            if (tag == null)
            {
                throw new NotFoundException($"Tag with id {id} not found");
            }

            return MapToDto(tag);
        }

        public async Task<(TagDto Tag, bool Created)> CreateOrGetTagAsync(int workspaceId, int actorUserId, CreateTagDto dto)
        {
            await EnsureMemberAsync(workspaceId, actorUserId);
            var name = dto.Name.Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new ValidationException("Tag name is required");
            }

            var existing = await _tagRepository.GetByNameAsync(workspaceId, name);
            if (existing != null)
            {
                return (MapToDto(existing), false);
            }

            var tag = new Tag
            {
                Name = name,
                WorkspaceId = workspaceId,
                CreatedAt = DateTime.UtcNow
            };

            var created = await _tagRepository.AddAsync(tag);
            return (MapToDto(created), true);
        }

        private async Task EnsureMemberAsync(int workspaceId, int actorUserId)
        {
            var isMember = await _workspaceMemberRepository.IsMemberAsync(workspaceId, actorUserId);
            if (!isMember)
            {
                throw new ForbiddenException("You are not a member of this workspace");
            }
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
