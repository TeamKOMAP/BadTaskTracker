using TaskManager.Application.DTOs;

namespace TaskManager.Application.Interfaces
{
    public interface ITagService
    {
        Task<IEnumerable<TagDto>> GetTagsAsync(string? query = null);
        Task<TagDto> GetTagByIdAsync(int id);
        Task<(TagDto Tag, bool Created)> CreateOrGetTagAsync(CreateTagDto dto);
    }
}
