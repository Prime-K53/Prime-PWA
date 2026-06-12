import { BaseRepository } from './BaseRepository';
import type { SettingEntity } from '../types';

export class SettingRepository extends BaseRepository<SettingEntity> {
  protected tableName = 'settings';

  async getJson<T>(key: string): Promise<T | undefined> {
    const setting = await this.findById(key);
    if (!setting) return undefined;
    try { return JSON.parse(setting.valueJson) as T; } catch { return undefined; }
  }

  async setJson<T>(key: string, value: T, category: SettingEntity['category'] = 'system'): Promise<void> {
    const valueJson = JSON.stringify(value);
    const valueType = Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value as SettingEntity['valueType'];
    await this.upsert({
      id: key,
      settingKey: key,
      category,
      scope: 'global',
      valueType,
      valueJson,
      isSystem: key.startsWith('system:') || key.startsWith('offline:'),
      entityVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
      source: 'user-action',
      sync: { status: 'pending', retryCount: 0 },
      tags: [],
    } as SettingEntity);
  }

  async remove(key: string): Promise<void> {
    await this.softDelete(key);
  }

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {};
    for (const key of keys) {
      const value = await this.getJson(key);
      if (value !== undefined) results[key] = value;
    }
    return results;
  }
}

export const settingRepository = new SettingRepository();
