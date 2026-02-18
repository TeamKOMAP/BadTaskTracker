namespace TaskManager.Application.Interfaces
{
    public interface IOverdueStatusService
    {
        Task<int> SyncAllOverdueStatusesAsync(CancellationToken cancellationToken = default);
    }
}
