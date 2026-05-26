import { BaseRepository } from './BaseRepository';
import type { AuditLogEntity } from '../types';

export class AuditLogRepository extends BaseRepository<AuditLogEntity> {
  protected tableName = 'auditLogs';

  async findByEntity(entityType: string, entityId: string): Promise<AuditLogEntity[]> {
    const table = await this.getTable();
    return table.filter((log) => log.entityType === entityType && log.entityId === entityId && !log.isDeleted)
      .reverse().toArray();
  }

  async findByActor(actorId: string): Promise<AuditLogEntity[]> {
    const table = await this.getTable();
    return table.filter((log) => log.actorId === actorId && !log.isDeleted)
      .reverse().toArray();
  }

  async findByDateRange(from: string, to: string): Promise<AuditLogEntity[]> {
    const table = await this.getTable();
    return table.filter((log) => log.timestamp >= from && log.timestamp <= to && !log.isDeleted)
      .sortBy('timestamp').then((r) => r.reverse());
  }
}

export const auditLogRepository = new AuditLogRepository();
