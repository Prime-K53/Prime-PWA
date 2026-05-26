import type { Observable } from 'dexie';

interface SubscriptionEntry {
  key: string;
  subscription: {
    unsubscribe: () => void;
  };
  refCount: number;
}

export class SubscriptionManager {
  private static subscriptions = new Map<string, SubscriptionEntry>();

  static subscribe<T>(
    key: string,
    observable: Observable<T>,
    callback: (data: T) => void
  ): () => void {
    const existing = this.subscriptions.get(key);
    if (existing) {
      existing.refCount++;
      return () => {
        existing.refCount--;
        if (existing.refCount <= 0) {
          existing.subscription.unsubscribe();
          this.subscriptions.delete(key);
        }
      };
    }

    const rawSubscription = observable.subscribe({
      next: callback,
      error: () => this.subscriptions.delete(key),
    });

    const entry: SubscriptionEntry = {
      key,
      subscription: rawSubscription,
      refCount: 1,
    };

    this.subscriptions.set(key, entry);

    return () => {
      entry.refCount--;
      if (entry.refCount <= 0) {
        rawSubscription.unsubscribe();
        this.subscriptions.delete(key);
      }
    };
  }

  static unsubscribe(key: string): void {
    const entry = this.subscriptions.get(key);
    if (entry) {
      entry.subscription.unsubscribe();
      this.subscriptions.delete(key);
    }
  }

  static clear(): void {
    for (const [, entry] of this.subscriptions) {
      entry.subscription.unsubscribe();
    }
    this.subscriptions.clear();
  }

  static get activeCount(): number {
    return this.subscriptions.size;
  }
}

export const subscriptionManager = SubscriptionManager;
