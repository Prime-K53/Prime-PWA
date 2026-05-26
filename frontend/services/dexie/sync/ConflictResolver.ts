import type { BaseEntity } from '../types';

export type ConflictResolutionStrategy = 'last-write-wins' | 'first-write-wins' | 'manual' | 'merge';

export interface ConflictRecord {
  id: string;
  entityType: string;
  entityId: string;
  localVersion: number;
  remoteVersion: number;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  resolvedAt?: string;
  resolution?: 'local' | 'remote' | 'merged';
  mergedData?: Record<string, unknown>;
}

export class ConflictResolver {
  private strategy: ConflictResolutionStrategy = 'last-write-wins';

  setStrategy(strategy: ConflictResolutionStrategy): void {
    this.strategy = strategy;
  }

  async resolve<T extends BaseEntity>(
    local: T,
    remote: Partial<T>,
    strategy?: ConflictResolutionStrategy
  ): Promise<{ resolved: T; conflict: boolean }> {
    const activeStrategy = strategy || this.strategy;

    switch (activeStrategy) {
      case 'last-write-wins':
        return this.lastWriteWins(local, remote);
      case 'first-write-wins':
        return { resolved: local, conflict: false };
      case 'manual':
        return { resolved: local, conflict: true };
      case 'merge':
        return this.merge(local, remote);
      default:
        return { resolved: local, conflict: false };
    }
  }

  private async lastWriteWins<T extends BaseEntity>(local: T, remote: Partial<T>): Promise<{ resolved: T; conflict: boolean }> {
    const localTime = new Date(local.updatedAt).getTime();
    const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;

    if (remoteTime > localTime) {
      return { resolved: { ...local, ...remote, id: local.id, entityVersion: local.entityVersion + 1 }, conflict: true };
    }
    return { resolved: local, conflict: false };
  }

  private async merge<T extends BaseEntity>(local: T, remote: Partial<T>): Promise<{ resolved: T; conflict: boolean }> {
    const merged = { ...local };
    let hasConflict = false;

    for (const [key, value] of Object.entries(remote)) {
      if (key === 'id' || key === 'entityVersion' || key === 'createdAt') continue;
      if (key === 'updatedAt') {
        merged.updatedAt = new Date().toISOString();
        continue;
      }
      if (JSON.stringify((local as any)[key]) !== JSON.stringify(value)) {
        (merged as any)[key] = value;
        hasConflict = true;
      }
    }

    return { resolved: merged, conflict: hasConflict };
  }
}

export const conflictResolver = new ConflictResolver();
