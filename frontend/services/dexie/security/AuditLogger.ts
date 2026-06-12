import { auditLogRepository } from '../repositories/AuditLogRepository';
import type { AuditLogEntity } from '../types';

export interface AuditEvent {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
}

export class AuditLogger {
  async log(event: AuditEvent): Promise<void> {
    const now = new Date().toISOString();
    const entry: AuditLogEntity = {
      id: `audit-${event.correlationId || crypto.randomUUID?.() || Date.now()}`,
      timestamp: now,
      correlationId: event.correlationId || crypto.randomUUID?.() || `${Date.now()}`,
      actorId: event.actorId,
      actorRole: event.actorRole,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      reason: event.reason,
      beforeJson: event.before ? JSON.stringify(event.before) : undefined,
      afterJson: event.after ? JSON.stringify(event.after) : undefined,
      deltaJson: event.before && event.after ? JSON.stringify(this.computeDelta(event.before, event.after)) : undefined,
      entityVersion: 1,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      source: 'user-action',
      sync: { status: 'pending', retryCount: 0 },
      tags: [event.entityType, event.action],
    };

    await auditLogRepository.upsert(entry);
  }

  private computeDelta(before: unknown, after: unknown): Record<string, { from: unknown; to: unknown }> {
    const delta: Record<string, { from: unknown; to: unknown }> = {};
    const beforeRecord = before as Record<string, unknown>;
    const afterRecord = after as Record<string, unknown>;

    for (const key of Object.keys({ ...beforeRecord, ...afterRecord })) {
      if (key === 'updatedAt' || key === 'entityVersion') continue;
      if (JSON.stringify(beforeRecord[key]) !== JSON.stringify(afterRecord[key])) {
        delta[key] = { from: beforeRecord[key], to: afterRecord[key] };
      }
    }

    return delta;
  }

  async query(options: {
    actorId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AuditLogEntity[]> {
    let results = await auditLogRepository.findAll();

    if (options.actorId) results = results.filter((r) => r.actorId === options.actorId);
    if (options.entityType) results = results.filter((r) => r.entityType === options.entityType);
    if (options.entityId) results = results.filter((r) => r.entityId === options.entityId);
    if (options.action) results = results.filter((r) => r.action === options.action);
    if (options.from) results = results.filter((r) => r.timestamp >= options.from!);
    if (options.to) results = results.filter((r) => r.timestamp <= options.to!);
    if (options.limit) results = results.slice(0, options.limit);

    return results;
  }
}

export const auditLogger = new AuditLogger();
