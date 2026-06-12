import { startupOrchestrator } from './StartupOrchestrator';

export class PhaseManager {
  async registerCoreTasks(): Promise<void> {
    startupOrchestrator.addTask('db-init', 'critical', async () => {
      await import('../DatabaseManager').then((m) => m.databaseManager.initialize());
    }, 'Initialize Database');

    startupOrchestrator.addTask('schema-validate', 'critical', async () => {
      const { validateSchema } = await import('../utils/validation');
      const result = await validateSchema();
      if (!result.valid) {
        console.warn('[Schema] Validation issues:', result.issues);
      }
    }, 'Validate Schema');

    startupOrchestrator.addTask('migrate-legacy', 'critical', async () => {
      const { runMigration } = await import('../utils/migration');
      await runMigration();
    }, 'Legacy Migration');

    startupOrchestrator.addTask('sync-engine', 'dashboard', async () => {
      const { syncEngine } = await import('../sync/SyncEngine');
      await syncEngine.start();
    }, 'Sync Engine');

    startupOrchestrator.addTask('notification-cleanup', 'dashboard', async () => {
      const { notificationRepository } = await import('../repositories/NotificationRepository');
      const expired = await notificationRepository.findAll();
      const now = new Date();
      for (const n of expired) {
        if (n.expiresAt && new Date(n.expiresAt) < now) {
          await notificationRepository.softDelete(n.id);
        }
      }
    }, 'Notification Cleanup');

    startupOrchestrator.addTask('analytics-prefetch', 'background', async () => {
      const { dashboardSnapshotService } = await import('../analytics/DashboardSnapshot');
      await dashboardSnapshotService.generateSnapshot();
    }, 'Analytics Prefetch');

    startupOrchestrator.addTask('cache-warm', 'background', async () => {
      const { aggregationService } = await import('../analytics/Aggregations');
      await Promise.all([
        aggregationService.getTotalRevenue(),
        aggregationService.getOutstandingBalance(),
        aggregationService.getProductCount(),
        aggregationService.getCustomerCount(),
      ]);
    }, 'Cache Warming');

    startupOrchestrator.addTask('integrity-check', 'deferred', async () => {
      const { checkIntegrity } = await import('../utils/integrity');
      await checkIntegrity();
    }, 'Integrity Check');
  }

  getProgress() {
    return startupOrchestrator.progress;
  }

  getPhase() {
    return startupOrchestrator.phase;
  }

  isReady() {
    return startupOrchestrator.ready;
  }
}

export const phaseManager = new PhaseManager();
