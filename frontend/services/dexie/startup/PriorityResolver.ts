import { startupOrchestrator, type StartupPhase } from './StartupOrchestrator';

export type RoutePriority = 'critical' | 'dashboard' | 'background' | 'deferred';

export interface RouteLoadingPlan {
  path: string;
  priority: RoutePriority;
  repositories: string[];
  preload: boolean;
}

const ROUTE_PLANS: RouteLoadingPlan[] = [
  { path: '/', priority: 'critical', repositories: ['settings'], preload: true },
  { path: '/sales-flow', priority: 'dashboard', repositories: ['customers', 'invoices', 'products'], preload: false },
  { path: '/supply-chain', priority: 'dashboard', repositories: ['products', 'inventoryBalances', 'warehouses'], preload: false },
  { path: '/industrial', priority: 'dashboard', repositories: ['workCenters', 'productionResources', 'manufacturingJobs'], preload: false },
  { path: '/examination', priority: 'dashboard', repositories: ['examinationPricing'], preload: false },
  { path: '/procurement', priority: 'background', repositories: ['suppliers', 'expenses'], preload: false },
  { path: '/fiscal-reports', priority: 'background', repositories: ['invoices', 'payments', 'expenses'], preload: false },
  { path: '/revenue', priority: 'background', repositories: ['invoices', 'payments'], preload: false },
  { path: '/settings', priority: 'background', repositories: ['settings'], preload: false },
  { path: '/audit', priority: 'deferred', repositories: ['auditLogs'], preload: false },
];

export class PriorityResolver {
  static getRoutePlan(path: string): RouteLoadingPlan | undefined {
    const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
    return ROUTE_PLANS.find(
      (plan) => plan.path === normalized || normalized.startsWith(plan.path + '/')
    );
  }

  static getRequiredRepositories(path: string): string[] {
    const plan = this.getRoutePlan(path);
    return plan?.repositories ?? [];
  }

  static getPhaseForPath(path: string): StartupPhase {
    const plan = this.getRoutePlan(path);
    return plan?.priority || 'background';
  }

  static shouldPreload(path: string): boolean {
    const plan = this.getRoutePlan(path);
    return plan?.preload ?? false;
  }
}
