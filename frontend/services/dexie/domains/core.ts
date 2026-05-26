import { DatabaseManagerFactory } from '../DatabaseManagerFactory';
import type { Table } from 'dexie';
import type {
  SettingEntity, UserEntity, NotificationEntity, AuditLogEntity
} from '../types';

const table = <T = Record<string, unknown>>(name: string) =>
  DatabaseManagerFactory.getTable<T>(name);

export const CoreDomain = {
  settings: () => table<SettingEntity>('settings'),
  users: () => table<UserEntity>('users'),
  notifications: () => table<NotificationEntity>('notifications'),
  auditLogs: () => table<AuditLogEntity>('auditLogs'),
};
