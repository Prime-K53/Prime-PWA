import { BaseRepository } from './BaseRepository';
import type { NotificationEntity } from '../types';

export class NotificationRepository extends BaseRepository<NotificationEntity> {
  protected tableName = 'notifications';

  async findByUser(userId: string): Promise<NotificationEntity[]> {
    return this.findAll({ selector: { userId } as Partial<NotificationEntity> });
  }

  async findUnread(userId: string): Promise<NotificationEntity[]> {
    return this.findAll({ selector: { userId, isRead: false } as unknown as Partial<NotificationEntity> });
  }

  async markAsRead(id: string): Promise<void> {
    await this.patch(id, { isRead: true, readAt: new Date().toISOString() } as Partial<NotificationEntity>);
  }

  async markAllAsRead(userId: string): Promise<void> {
    const unread = await this.findUnread(userId);
    for (const notification of unread) {
      await this.markAsRead(notification.id);
    }
  }
}

export const notificationRepository = new NotificationRepository();
