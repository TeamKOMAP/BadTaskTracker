using TaskManager.Application.Interfaces;

namespace TaskManager.API.Background
{
    public class OverdueStatusSyncBackgroundService : BackgroundService
    {
        private static readonly TimeSpan SyncInterval = TimeSpan.FromMinutes(1);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<OverdueStatusSyncBackgroundService> _logger;

        public OverdueStatusSyncBackgroundService(
            IServiceScopeFactory scopeFactory,
            ILogger<OverdueStatusSyncBackgroundService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            await SyncOnceAsync(stoppingToken);

            using var timer = new PeriodicTimer(SyncInterval);
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await SyncOnceAsync(stoppingToken);
            }
        }

        private async Task SyncOnceAsync(CancellationToken cancellationToken)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var overdueStatusService = scope.ServiceProvider.GetRequiredService<IOverdueStatusService>();
                var updated = await overdueStatusService.SyncAllOverdueStatusesAsync(cancellationToken);

                if (updated > 0)
                {
                    _logger.LogInformation("Background overdue sync updated {Count} task statuses", updated);
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                // graceful shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background overdue sync failed");
            }
        }
    }
}
