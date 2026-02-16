using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface ITagService
    {
        Task<IEnumerable<TagDto>> GetTagsAsync(int workspaceId, int actorUserId, string? query = null);
        Task<TagDto> GetTagByIdAsync(int workspaceId, int actorUserId, int id);
        Task<(TagDto Tag, bool Created)> CreateOrGetTagAsync(int workspaceId, int actorUserId, CreateTagDto dto);
    }
}
