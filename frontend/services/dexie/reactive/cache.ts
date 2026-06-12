interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

export class QueryCache {
  private static cache = new Map<string, CacheEntry<unknown>>();
  private static readonly DEFAULT_TTL_MS = 30000;
  private static readonly MAX_ENTRIES = 100;

  static get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  static set<T>(key: string, data: T, ttlMs: number = this.DEFAULT_TTL_MS): void {
    if (this.cache.size >= this.MAX_ENTRIES) {
      const oldest = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.createdAt - b.createdAt)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs, createdAt: Date.now() });
  }

  static invalidate(key: string): void {
    this.cache.delete(key);
  }

  static invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) this.cache.delete(key);
    }
  }

  static clear(): void {
    this.cache.clear();
  }

  static get size(): number {
    return this.cache.size;
  }
}

export const queryCache = QueryCache;
