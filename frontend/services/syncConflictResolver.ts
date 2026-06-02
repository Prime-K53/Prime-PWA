export type ResolveResult = 'local_wins' | 'remote_wins';

export function resolveConflict(
  localRecord: any,
  remoteRecord: any
): ResolveResult {
  const localVersion = Number(localRecord.version || localRecord._version || 0);
  const remoteVersion = Number(remoteRecord.version || remoteRecord._version || 0);

  if (localVersion > remoteVersion) return 'local_wins';
  if (remoteVersion > localVersion) return 'remote_wins';

  const localTime = new Date(localRecord._updatedAt || localRecord.updated_at || 0).getTime();
  const remoteTime = new Date(remoteRecord.updated_at || remoteRecord._updatedAt || 0).getTime();

  if (localTime >= remoteTime) return 'local_wins';
  return 'remote_wins';
}

export function mergeRecords(localRecord: any, remoteRecord: any): any {
  const winner = resolveConflict(localRecord, remoteRecord);
  if (winner === 'local_wins') {
    return { ...remoteRecord, ...localRecord, _updatedAt: new Date().toISOString() };
  }
  return { ...localRecord, ...remoteRecord, _updatedAt: new Date().toISOString() };
}
