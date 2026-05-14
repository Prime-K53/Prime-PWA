/**
 * Notification Service for Prime ERP
 * Handles in-app notifications and alerts
 */

import { logger } from './logger';

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

// Storage key
const NOTIFICATIONS_KEY = 'nexus_notifications';

// In-memory store
let notifications: Notification[] = [];
let listeners: Set<(notifications: Notification[]) => void> = new Set();

/**
 * Initialize the notification service
 */
export function initializeNotifications(): void {
  try {
    const saved = localStorage.getItem(NOTIFICATIONS_KEY);
    if (saved) {
      notifications = JSON.parse(saved);
    }
  } catch (error) {
    logger.error('Failed to load notifications', error as Error);
    notifications = [];
  }
}

/**
 * Save notifications to storage
 */
function saveNotifications(): void {
  try {
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
    notifyListeners();
  } catch (error) {
    logger.error('Failed to save notifications', error as Error);
  }
}

/**
 * Notify listeners of changes
 */
function notifyListeners(): void {
  listeners.forEach(listener => listener([...notifications]));
}

/**
 * Subscribe to notification changes
 */
export function subscribeToNotifications(callback: (notifications: Notification[]) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Create a notification
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
    id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: options.type || 'info',
    title: options.title,
    message: options.message,
    timestamp: new Date(),
    read: false,
    userId: options.userId,
    entityType: options.entityType,
    entityId: options.entityId,
    actionUrl: options.actionUrl,
    metadata: options.metadata,
  };

  notifications.unshift(notification);
  
  // Keep only last 100 notifications
  if (notifications.length > 100) {
    notifications = notifications.slice(0, 100);
  }

  saveNotifications();
  
  logger.info('Notification created', { id: notification.id, type: notification.type, title: notification.title });
  
  return notification;
}

/**
 * Get all notifications
 */
export function getNotifications(userId?: string, unreadOnly: boolean = false): Notification[] {
  let filtered = [...notifications];
  
  if (userId) {
    filtered = filtered.filter(n => n.userId === userId || !n.userId);
  }
  
  if (unreadOnly) {
    filtered = filtered.filter(n => !n.read);
  }
  
  return filtered;
}

/**
 * Get notification by ID
 */
export function getNotification(id: string): Notification | undefined {
  return notifications.find(n => n.id === id);
}

/**
 * Mark notification as read
 */
export function markAsRead(id: string): boolean {
  const notification = notifications.find(n => n.id === id);
  if (notification) {
    notification.read = true;
    saveNotifications();
    return true;
  }
  return false;
}

/**
 * Mark all notifications as read
 */
export function markAllAsRead(userId?: string): void {
  notifications.forEach(n => {
    if (!userId || n.userId === userId) {
      n.read = true;
    }
  });
  saveNotifications();
}

/**
 * Delete a notification
 */
export function deleteNotification(id: string): boolean {
  const index = notifications.findIndex(n => n.id === id);
  if (index !== -1) {
    notifications.splice(index, 1);
    saveNotifications();
    return true;
  }
  return false;
}

/**
 * Clear all notifications
 */
export function clearNotifications(userId?: string): void {
  if (userId) {
    notifications = notifications.filter(n => n.userId !== userId);
  } else {
    notifications = [];
  }
  saveNotifications();
}

/**
 * Get unread count
 */
export function getUnreadCount(userId?: string): number {
  return notifications.filter(n => !n.read && (!userId || n.userId === userId)).length;
}

// Initialize on module load
initializeNotifications();

// Export as object for compatibility
export const notificationService = {
  notify,
  getNotifications,
  getNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  getUnreadCount,
  subscribeToNotifications,
};
