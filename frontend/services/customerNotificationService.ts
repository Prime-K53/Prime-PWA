
import { dbService } from './db';
import { CompanyConfig } from '../types';

export type NotificationActivityType =
  | 'QUOTATION'
  | 'SALES_ORDER'
  | 'INVOICE'
  | 'EXAMINATION_INVOICE'
  | 'EXAM_BATCH'
  | 'PAYMENT'
  | 'RECEIPT';

export interface NotificationLog {
  id: string;
  type: NotificationActivityType;
  entityId: string;
  customerName: string;
  phoneNumber: string;
  message: string;
  timestamp: string;
  status: 'sent' | 'failed' | 'cancelled';
  deliveryMode?: 'offline-draft' | 'external';
}

const getCompanyConfig = (): CompanyConfig | null => {
  const saved = localStorage.getItem('nexus_company_config');
  return saved ? JSON.parse(saved) : null;
};

const DEFAULT_TEMPLATES: Record<NotificationActivityType, string> = {
  QUOTATION: "Hi {customerName}! 📄 Great news! Your quotation #{id} for {amount} is ready at {companyName}. We can't wait to serve you! Review it today and let us know if you have any questions. We're here to help you succeed! 🌟",
  SALES_ORDER: "Hi {customerName}! 🛍️ Awesome! Your sales order #{id} for {amount} has been confirmed at {companyName}. Our team is already working on preparing your items with care and precision. We'll notify you as soon as they're ready. Thank you for trusting us with your needs! 🚚✨",
  INVOICE: "Hi {customerName}! 🧾 Your invoice #{id} for {amount} from {companyName} is now due on {dueDate}. We appreciate your prompt attention to this matter. Paying on time helps us continue delivering the excellent service you deserve. Need assistance? We're just a message away! 💳🙂",
  EXAMINATION_INVOICE: "Hi {customerName}! 📝 Your service invoice #{id} for {amount} from {companyName} is now due on {dueDate}. Thank you for choosing us for your examination needs. Complete your payment today and let's continue building success together! 🎓💪",
  EXAM_BATCH: "Hi {customerName}! ✅ Exciting news! Your examination batch #{id} has been approved at {companyName} with {count} candidates. We're committed to making this process smooth and successful for you. Get ready for outstanding results! Let's achieve greatness together! 🎉🏆",
  PAYMENT: "Hi {customerName}! 💰 Thank you! We've received your payment of {amount} for {id} at {companyName}. Your trust means the world to us! We're already preparing to exceed your expectations on your next visit. See you soon! 🙏❤️",
  RECEIPT: "Hi {customerName}! 🧾 Your receipt #{id} for {amount} has been issued by {companyName}. Thank you for your continued support! We value you as a cherished customer and look forward to serving you again. Remember - your satisfaction is our greatest reward! ⭐🌈"
};

const ACTIVITY_LABELS: Record<NotificationActivityType, string> = {
  QUOTATION: 'quotation',
  SALES_ORDER: 'sales order',
  INVOICE: 'invoice',
  EXAMINATION_INVOICE: 'service invoice',
  EXAM_BATCH: 'examination batch',
  PAYMENT: 'payment receipt',
  RECEIPT: 'payment receipt'
};

/**
 * Template-based message generator (no AI)
 */
const generateMessageFromTemplate = (
  type: NotificationActivityType,
  data: any,
  config: CompanyConfig
): string => {
  const template = DEFAULT_TEMPLATES[type] || "Hi {customerName}! Thank you for choosing {companyName}!";
  return replacePlaceholders(template, data, config);
};

const replacePlaceholders = (template: string, data: any, config: CompanyConfig): string => {
  return template
    .replace(/{customerName}/g, data.customerName || 'Valued Customer')
    .replace(/{id}/g, data.id || '')
    .replace(/{amount}/g, data.amount || '')
    .replace(/{dueDate}/g, data.dueDate || '')
    .replace(/{count}/g, data.count || '')
    .replace(/{companyName}/g, config.companyName);
};

const sanitizePhoneNumber = (phoneNumber: string): string => {
  const digitsOnly = String(phoneNumber || '').replace(/[^\d]/g, '');
  return digitsOnly || String(phoneNumber || '').replace(/\s+/g, '');
};

/**
 * Rate limiting check (e.g., max 1 notification per entity per 5 minutes)
 */
const checkRateLimit = async (type: NotificationActivityType, entityId: string): Promise<boolean> => {
  try {
    const logs = await dbService.getAll<NotificationLog>('customerNotificationLogs');
    const recent = logs.find(l => 
      l.type === type && 
      l.entityId === entityId && 
      (Date.now() - new Date(l.timestamp).getTime() < 5 * 60 * 1000)
    );
    return !recent;
  } catch {
    return true;
  }
};

export const customerNotificationService = {
  /**
   * Main trigger for customer notifications
   */
  async triggerNotification(
    type: NotificationActivityType,
    data: {
      id: string;
      customerName: string;
      phoneNumber?: string;
      amount?: string;
      dueDate?: string;
      count?: number;
      [key: string]: any;
    }
  ) {
    const config = getCompanyConfig();
    if (!config?.notificationSettings?.customerActivityNotifications) {
      console.log(`[Notification] System disabled for ${type}`);
      return;
    }

    if (!data.phoneNumber) {
      console.warn(`[Notification] No phone number for ${data.customerName}`);
      return;
    }

    const canProceed = await checkRateLimit(type, data.id);
    if (!canProceed) {
      console.warn(`[Notification] Rate limit exceeded for ${type} ${data.id}`);
      return;
    }

    const message = generateMessageFromTemplate(type, data, config);

    const logEntryBase = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      entityId: data.id,
      customerName: data.customerName,
      phoneNumber: data.phoneNumber || '',
      message,
      timestamp: new Date().toISOString(),
    };

    // Auto-send when notifications are enabled (no manual confirmation needed)
    const shouldSend = true;

    if (!shouldSend) {
      await dbService.put('customerNotificationLogs', {
        ...logEntryBase,
        status: 'cancelled'
      });
      console.log(`[Notification] Cancelled ${type} for ${data.customerName}`);
      return;
    }

    try {
      await dbService.put('customerNotificationLogs', {
        ...logEntryBase,
        status: 'sent',
        deliveryMode: 'offline-draft'
      });
      console.log(`[Notification] Saved offline draft for ${type} ${sanitizePhoneNumber(data.phoneNumber)} (${data.customerName})`);
    } catch (error) {
      console.error(`[Notification] Failed to process ${type}:`, error);
      await dbService.put('customerNotificationLogs', { ...logEntryBase, status: 'failed' });
    }
  },

  async getLogs(): Promise<NotificationLog[]> {
    return await dbService.getAll<NotificationLog>('customerNotificationLogs');
  }
};
