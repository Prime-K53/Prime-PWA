import { databaseManager } from '../DatabaseManager';

export class WorkspaceIsolation {
  private _workspaceId: string | null = null;

  get workspaceId(): string | null { return this._workspaceId; }

  setWorkspace(workspaceId: string): void {
    this._workspaceId = workspaceId;
  }

  clear(): void {
    this._workspaceId = null;
  }

  async isolateTable<T extends { tags?: string[] }>(tableName: string): Promise<T[]> {
    if (!this._workspaceId) return [];
    const db = await databaseManager.getDatabase();
    const table = (db as any)[tableName] as import('dexie').Table<T, string>;
    if (!table) return [];
    return table.filter((item: any) => item.tags?.includes(`workspace:${this._workspaceId}`)).toArray() as Promise<T[]>;
  }

  tagRecord(tags: string[] = []): string[] {
    if (!this._workspaceId) return tags;
    const workspaceTag = `workspace:${this._workspaceId}`;
    if (!tags.includes(workspaceTag)) {
      return [...tags, workspaceTag];
    }
    return tags;
  }
}

export const workspaceIsolation = new WorkspaceIsolation();
