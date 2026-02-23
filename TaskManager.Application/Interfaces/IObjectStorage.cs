using System.IO;
using System.Threading;

namespace TaskManager.Application.Interfaces
{
    public interface IObjectStorage
    {
        Task UploadAsync(
            string bucket,
            string objectKey,
            Stream content,
            string contentType,
            CancellationToken cancellationToken = default);

        Task<Stream?> OpenReadAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default);

        Task<bool> DeleteAsync(
            string bucket,
            string objectKey,
            CancellationToken cancellationToken = default);
    }
}
