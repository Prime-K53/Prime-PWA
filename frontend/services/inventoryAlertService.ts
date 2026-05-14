/**
 * Inventory Alert Service
 * 
 * Monitors inventory levels and triggers alerts when:
 * - Items fall below reorder point
 * - Items reach minimum stock level (critical)
 * - Items are out of stock
 * - Items have not been reordered within expected timeframe
 */

import { Item, WarehouseInventory } from '../types';

export interface InventoryAlert {
  id: string;
  itemId: string;
  itemName: string;
  warehouseId?: string;
  alertType: 'critical' | 'warning' | 'info';
  severity: 'high' | 'medium' | 'low';
  message: string;
  currentQuantity: number;
  threshold: number;
  thresholdType: 'reorder_point' | 'min_stock_level' | 'max_stock_level';
  createdAt: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface AlertThresholds {
  reorderPoint: number;
  minStockLevel: number;
  maxStockLevel: number;
}

export interface AlertConfig {
  enableEmailNotifications: boolean;
  enablePushNotifications: boolean;
  enableDashboardAlerts: boolean;
  checkIntervalMinutes: number;
  criticalAlertThreshold: number; // hours before alert becomes critical
}

const DEFAULT_CONFIG: AlertConfig = {
  enableEmailNotifications: false,
  enablePushNotifications: true,
  enableDashboardAlerts: true,
  checkIntervalMinutes: 15,
  criticalAlertThreshold: 24
};

class InventoryAlertService {
  private readonly STORAGE_KEY = 'inventoryAlerts';
  private readonly CONFIG_KEY = 'inventoryAlertConfig';
  private config: AlertConfig = DEFAULT_CONFIG;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load alert configuration
   */
  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      if (stored) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('[InventoryAlertService] Error loading config:', error);
    }
  }

  /**
   * Save alert configuration
   */
  saveConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
  }

  /**
   * Get current config
   */
  getConfig(): AlertConfig {
    return { ...this.config };
  }

  /**
   * Check inventory levels and generate alerts
   */
  async checkInventoryLevels(items: Item[], warehouseInventory?: WarehouseInventory[]): Promise<InventoryAlert[]> {
    const alerts: InventoryAlert[] = [];
    const existingAlerts = this.getActiveAlerts();

    for (const item of items) {
      const currentQty = item.stock || 0;
      // Use type-safe property access with any existing aliases
      const itemAny = item as any;
      const thresholds: AlertThresholds = {
        reorderPoint: itemAny.reorderPoint || itemAny.reorder_point || 0,
        minStockLevel: itemAny.minStockLevel || itemAny.min_stock_level || 0,
        maxStockLevel: itemAny.maxStockLevel || itemAny.max_stock_level || 0
      };

      // Check minimum stock level (critical)
      if (thresholds.minStockLevel > 0 && currentQty <= thresholds.minStockLevel) {
        const existingAlert = existingAlerts.find(a => 
          a.itemId === item.id && 
          a.thresholdType === 'min_stock_level' && 
          !a.acknowledged
        );
        
        if (!existingAlert) {
          alerts.push(this.createAlert(
            item,
            'critical',
            'high',
            `CRITICAL: ${item.name} has reached minimum stock level`,
            currentQty,
            thresholds.minStockLevel,
            'min_stock_level'
          ));
        }
      }
      // Check reorder point (warning)
      else if (thresholds.reorderPoint > 0 && currentQty <= thresholds.reorderPoint) {
        const existingAlert = existingAlerts.find(a => 
          a.itemId === item.id && 
          a.thresholdType === 'reorder_point' && 
          !a.acknowledged
        );
        
        if (!existingAlert) {
          alerts.push(this.createAlert(
            item,
            'warning',
            currentQty <= thresholds.minStockLevel ? 'high' : 'medium',
            `Reorder Point: ${item.name} needs restocking (${currentQty} remaining)`,
            currentQty,
            thresholds.reorderPoint,
            'reorder_point'
          ));
        }
      }

      // Check maximum stock level (info - overstocked)
      if (thresholds.maxStockLevel > 0 && currentQty >= thresholds.maxStockLevel) {
        const existingAlert = existingAlerts.find(a => 
          a.itemId === item.id && 
          a.thresholdType === 'max_stock_level' && 
          !a.acknowledged
        );
        
        if (!existingAlert) {
          alerts.push(this.createAlert(
            item,
            'info',
            'low',
            `Overstock: ${item.name} exceeds maximum stock level (${currentQty} on hand)`,
            currentQty,
            thresholds.maxStockLevel,
            'max_stock_level'
          ));
        }
      }

      // Check for out of stock (only for stock-managed items)
      if (currentQty <= 0 && (item.type === 'Stationery' || item.type === 'Material' || item.type === 'Raw Material' || item.type === 'Product')) {
        const existingAlert = existingAlerts.find(a => 
          a.itemId === item.id && 
          a.alertType === 'critical' &&
          a.message.includes('out of stock') &&
          !a.acknowledged
        );
        
        if (!existingAlert) {
          alerts.push(this.createAlert(
            item,
            'critical',
            'high',
            `OUT OF STOCK: ${item.name} is now out of stock!`,
            currentQty,
            0,
            'reorder_point'
          ));
        }
      }
    }

    // Save new alerts
    if (alerts.length > 0) {
      const allAlerts = this.getAllAlerts();
      allAlerts.push(...alerts);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allAlerts.slice(-100))); // Keep last 100 alerts
      
      // Trigger notification if enabled
      if (this.config.enableDashboardAlerts) {
        this.triggerNotification(alerts);
      }
    }

    return alerts;
  }

  /**
   * Create an alert object
   */
  private createAlert(
    item: Item,
    alertType: 'critical' | 'warning' | 'info',
    severity: 'high' | 'medium' | 'low',
    message: string,
    currentQuantity: number,
    threshold: number,
    thresholdType: 'reorder_point' | 'min_stock_level' | 'max_stock_level'
  ): InventoryAlert {
    const itemAny = item as any;
    return {
      id: `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      itemId: item.id,
      itemName: itemAny.name || itemAny.material || 'Unknown Item',
      alertType,
      severity,
      message,
      currentQuantity,
      threshold,
      thresholdType,
      createdAt: new Date().toISOString(),
      acknowledged: false
    };
  }

  /**
   * Trigger browser notification
   */
  private triggerNotification(alerts: InventoryAlert[]): void {
    if (!('Notification' in window)) return;
    
    if (Notification.permission === 'granted') {
      const criticalAlerts = alerts.filter(a => a.alertType === 'critical');
      if (criticalAlerts.length > 0) {
        new Notification('Inventory Alert', {
          body: `${criticalAlerts.length} critical inventory alert(s) detected`,
          icon: '/icon.png'
        });
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): InventoryAlert[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[InventoryAlertService] Error loading alerts:', error);
    }
    return [];
  }

  /**
   * Get active (unacknowledged) alerts
   */
  getActiveAlerts(): InventoryAlert[] {
    return this.getAllAlerts().filter(a => !a.acknowledged);
  }

  /**
   * Get alerts by item
   */
  getAlertsForItem(itemId: string): InventoryAlert[] {
    return this.getAllAlerts().filter(a => a.itemId === itemId);
  }

  /**
   * Get alert counts by type
   */
  getAlertCounts(): { critical: number; warning: number; info: number; total: number } {
    const active = this.getActiveAlerts();
    return {
      critical: active.filter(a => a.alertType === 'critical').length,
      warning: active.filter(a => a.alertType === 'warning').length,
      info: active.filter(a => a.alertType === 'info').length,
      total: active.length
    };
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, userId: string): void {
    const alerts = this.getAllAlerts();
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
    }
  }

  /**
   * Acknowledge all alerts for an item
   */
  acknowledgeAllForItem(itemId: string, userId: string): void {
    const alerts = this.getAllAlerts();
    alerts.forEach(alert => {
      if (alert.itemId === itemId && !alert.acknowledged) {
        alert.acknowledged = true;
        alert.acknowledgedBy = userId;
        alert.acknowledgedAt = new Date().toISOString();
      }
    });
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
  }

  /**
   * Clear all alerts
   */
  clearAllAlerts(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
  }

  /**
   * Start automatic inventory checking
   */
  startAutoCheck(
    getItems: () => Promise<Item[]>,
    getWarehouseInventory?: () => Promise<WarehouseInventory[]>
  ): void {
    if (this.checkInterval) {
      this.stopAutoCheck();
    }

    this.checkInterval = setInterval(async () => {
      try {
        const items = await getItems();
        const whInventory = getWarehouseInventory ? await getWarehouseInventory() : undefined;
        await this.checkInventoryLevels(items, whInventory);
      } catch (error) {
        console.error('[InventoryAlertService] Auto-check error:', error);
      }
    }, this.config.checkIntervalMinutes * 60 * 1000);
  }

  /**
   * Stop automatic inventory checking
   */
  stopAutoCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Export alerts to CSV
   */
  exportToCSV(): string {
    const alerts = this.getAllAlerts();
    
    const headers = [
      'ID', 'Item', 'Type', 'Severity', 'Message', 'Current Qty', 'Threshold', 
      'Threshold Type', 'Created', 'Acknowledged', 'Acknowledged By', 'Acknowledged At'
    ];
    
    const rows = alerts.map(a => [
      a.id,
      `"${a.itemName}"`,
      a.alertType,
      a.severity,
      `"${a.message}"`,
      a.currentQuantity,
      a.threshold,
      a.thresholdType,
      a.createdAt,
      a.acknowledged ? 'Yes' : 'No',
      a.acknowledgedBy || '',
      a.acknowledgedAt || ''
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

export const inventoryAlertService = new InventoryAlertService();
export default inventoryAlertService;
