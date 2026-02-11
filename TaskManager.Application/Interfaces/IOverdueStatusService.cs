namespace TaskManager.Application.Interfaces
{
    public interface IOverdueStatusService
    {
        Task<int> SyncOverdueStatusesAsync();
    }
}
