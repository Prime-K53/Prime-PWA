/**
 * Notification Service for Prime ERP
 * Handles in-app notifications and alerts.
 */

import { logger } from './logger';
import type { NotificationEntity } from './dexie/types';
import { getEnterpriseRepositories } from './dexie/database';

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  userId?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

const NOTIFICATIONS_KEY = 'nexus_notifications';
const MAX_NOTIFICATIONS = 100;

let notifications: Notification[] = [];
const listeners: Set<(notifications: Notification[]) => void> = new Set();
let hydrationPromise: Promise<void> | null = null;

const nowIso = () => new Date().toISOString();

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';

const shouldUseDexie = () => canUseIndexedDb();

const persistLocalMirror = () => {
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  } catch (error) {
    logger.error('Failed to save notifications to local mirror', error as Error);
  }
};

const loadLocalMirror = () => {
  try {
    const saved = localStorage.getItem(NOTIFICATIONS_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved) as Notification[];
    return Array.isArray(parsed)
      ? parsed.map((entry) => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }))
      : [];
  } catch (error) {
    logger.error('Failed to load notifications', error as Error);
    return [];
  }
};

const mapTypeToPriority = (type: Notification['type']): NotificationEntity['priority'] => {
  switch (type) {
    case 'error':
      return 'urgent';
    case 'warning':
      return 'high';
    case 'success':
      return 'medium';
    case 'info':
    default:
      return 'low';
  }
};

const mapPriorityToType = (priority: NotificationEntity['priority'], metadata?: Record<string, any>): Notification['type'] => {
  const explicit = metadata?.serviceType;
  if (explicit === 'info' || explicit === 'success' || explicit === 'warning' || explicit === 'error') {
    return explicit;
  }

  switch (priority) {
    case 'urgent':
      return 'error';
    case 'high':
      return 'warning';
    case 'medium':
      return 'success';
    case 'low':
    default:
      return 'info';
  }
};

const toRepositoryEntity = (notification: Notification): NotificationEntity => {
  const timestamp = notification.timestamp instanceof Date
    ? notification.timestamp.toISOString()
    : new Date(notification.timestamp).toISOString();

  return {
    id: notification.id,
    entityVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    isDeleted: false,
    source: 'user-action',
    sync: { status: 'pending', retryCount: 0 },
    tags: [],
    notificationType: notification.type.toUpperCase(),
    category: 'system',
    userId: notification.userId || '',
    title: notification.title,
    message: notification.message,
    priority: mapTypeToPriority(notification.type),
    entityType: notification.entityType,
    entityId: notification.entityId || '',
    isRead: notification.read,
    deliveredAt: timestamp,
    readAt: notification.read ? timestamp : undefined,
    metadata: {
      ...(notification.metadata || {}),
      actionUrl: notification.actionUrl,
      serviceType: notification.type
    }
  };
};

const fromRepositoryEntity = (entity: NotificationEntity): Notification => ({
  id: entity.id,
  type: mapPriorityToType(entity.priority, entity.metadata as Record<string, any> | undefined),
  title: entity.title,
  message: entity.message,
  timestamp: new Date(entity.deliveredAt || entity.updatedAt || entity.createdAt),
  read: Boolean(entity.isRead),
  userId: entity.userId,
  entityType: entity.entityType,
  entityId: entity.entityId,
  actionUrl: typeof (entity.metadata as Record<string, any> | undefined)?.actionUrl === 'string'
    ? String((entity.metadata as Record<string, any>).actionUrl)
    : undefined,
  metadata: entity.metadata as Record<string, any> | undefined
});

const notifyListeners = () => {
  listeners.forEach((listener) => listener([...notifications]));
};

const replaceNotifications = (next: Notification[]) => {
  const previousIds = new Set(notifications.map((entry) => entry.id));
  notifications = next
    .slice()
    .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
    .slice(0, MAX_NOTIFICATIONS);
  const retainedIds = new Set(notifications.map((entry) => entry.id));
  const removedIds = [...previousIds].filter((id) => !retainedIds.has(id));
  persistLocalMirror();
  notifyListeners();
  void removeFromDexie(removedIds);
};

const hydrateFromDexie = async () => {
  if (!shouldUseDexie()) return;

  try {
    const repositories = await getEnterpriseRepositories();
    const rows = await repositories.notifications.findAll();

    if (rows.length > 0) {
      const merged = new Map<string, Notification>();
      [...notifications, ...rows].forEach((entry) => {
        const current = merged.get(entry.id);
        if (!current || new Date(current.timestamp).getTime() <= new Date((entry as any).timestamp || (entry as any).createdAt).getTime()) {
          merged.set(entry.id, fromRepositoryEntity(entry as any));
        }
      });
      replaceNotifications(Array.from(merged.values()));
    }
  } catch (error) {
    logger.error('Failed to hydrate notifications from Dexie', error as Error);
  }
};

const persistToDexie = async () => {
  if (!shouldUseDexie()) return;

  try {
    const repositories = await getEnterpriseRepositories();
    await repositories.notifications.bulkUpsert(
      notifications.map(toRepositoryEntity)
    );
  } catch (error) {
    logger.error('Failed to persist notifications in Dexie', error as Error);
  }
};

const removeFromDexie = async (ids: string[]) => {
  if (!shouldUseDexie() || ids.length === 0) return;

  try {
    const repositories = await getEnterpriseRepositories();
    await Promise.all(ids.map((id) => repositories.notifications.softDelete(id)));
  } catch (error) {
    logger.error('Failed to remove notifications from Dexie', error as Error);
  }
};

const persistState = () => {
  persistLocalMirror();
  void persistToDexie();
  notifyListeners();
};

/**
 * Initialize the notification service.
 */
export function initializeNotifications(): void {
  notifications = loadLocalMirror();

  if (!hydrationPromise) {
    hydrationPromise = hydrateFromDexie().finally(() => {
      hydrationPromise = null;
    });
  }
}

/**
 * Subscribe to notification changes.
 */
export function subscribeToNotifications(callback: (notifications: Notification[]) => void): () => void {
  listeners.add(callback);
  callback([...notifications]);
  return () => listeners.delete(callback);
}

/**
 * Create a notification.
 */
export function notify(options: {
  type?: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  userId?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}): Notification {
  const notification: Notification = {
    id: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    type: options.type || 'info',
    title: options.title,
    message: options.message,
    timestamp: new Date(),
    read: false,
    userId: options.userId,
    entityType: options.entityType,
    entityId: options.entityId,
    actionUrl: options.actionUrl,
    metadata: options.metadata
  };

  replaceNotifications([notification, ...notifications]);
  void persistToDexie();

  logger.info('Notification created', {
    id: notification.id,
    type: notification.type,
    title: notification.title
  });

  return notification;
}

/**
 * Get all notifications.
 */
export function getNotifications(userId?: string, unreadOnly = false): Notification[] {
  let filtered = [...notifications];

  if (userId) {
    filtered = filtered.filter((notification) => notification.userId === userId || !notification.userId);
  }

  if (unreadOnly) {
    filtered = filtered.filter((notification) => !notification.read);
  }

  return filtered;
}

/**
 * Get notification by ID.
 */
export function getNotification(id: string): Notification | undefined {
  return notifications.find((notification) => notification.id === id);
}

/**
 * Mark notification as read.
 */
export function markAsRead(id: string): boolean {
  const notification = notifications.find((entry) => entry.id === id);
  if (!notification) return false;

  notification.read = true;
  persistState();
  return true;
}

/**
 * Mark all notifications as read.
 */
export function markAllAsRead(userId?: string): void {
  notifications.forEach((notification) => {
    if (!userId || notification.userId === userId) {
      notification.read = true;
    }
  });

  persistState();
}

/**
 * Delete a notification.
 */
export function deleteNotification(id: string): boolean {
  const index = notifications.findIndex((notification) => notification.id === id);
  if (index === -1) return false;

  notifications.splice(index, 1);
  void removeFromDexie([id]);
  persistState();
  return true;
}

/**
 * Clear all notifications.
 */
export function clearNotifications(userId?: string): void {
  const removedIds = notifications
    .filter((notification) => !userId || notification.userId === userId)
    .map((notification) => notification.id);
  notifications = userId
    ? notifications.filter((notification) => notification.userId !== userId)
    : [];

  void removeFromDexie(removedIds);
  persistState();
}

/**
 * Get unread count.
 */
export function getUnreadCount(userId?: string): number {
  return notifications.filter((notification) => !notification.read && (!userId || notification.userId === userId)).length;
}

initializeNotifications();

export const notificationService = {
  notify,
  getNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  getUnreadCount,
  subscribeToNotifications
};
