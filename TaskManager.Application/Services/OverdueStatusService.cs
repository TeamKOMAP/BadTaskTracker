using TaskManager.Application.Interfaces;

namespace TaskManager.Application.Services
{
    public class OverdueStatusService : IOverdueStatusService
    {
        private readonly ITaskRepository _taskRepository;

        public OverdueStatusService(ITaskRepository taskRepository)
        {
            _taskRepository = taskRepository;
        }

        public Task<int> SyncOverdueStatusesAsync()
        {
            return _taskRepository.UpdateOverdueStatusesAsync(DateTime.UtcNow);
        }
    }
}
