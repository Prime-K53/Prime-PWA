
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { customerNotificationService } from '../../services/customerNotificationService';
import { dbService } from '../../services/db';

vi.mock('../../services/db', () => ({
  dbService: {
    put: vi.fn().mockResolvedValue({}),
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/geminiService', () => ({
  generateAIResponse: vi.fn().mockResolvedValue('AI Message'),
}));

describe('customerNotificationService', () => {
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      companyName: 'Test Corp',
      notificationSettings: { customerActivityNotifications: true }
    };
    
    // Global localStorage mock
    const store: Record<string, string> = {
      'nexus_company_config': JSON.stringify(mockConfig)
    };
    
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value; }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { for (const k in store) delete store[k]; })
    });
  });

  it('should trigger notification when enabled', async () => {
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789', amount: '$100' };
    const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => ({}) as any);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    
    await customerNotificationService.triggerNotification('QUOTATION', data);
    
    expect(confirmSpy).toHaveBeenCalled();
    expect(windowSpy).toHaveBeenCalled();
    expect(dbService.put).toHaveBeenCalledWith('customerNotificationLogs', expect.objectContaining({
      customerName: 'John Doe',
      type: 'QUOTATION'
    }));
  });

  it('should not trigger notification when disabled', async () => {
    mockConfig.notificationSettings.customerActivityNotifications = false;
    localStorage.setItem('nexus_company_config', JSON.stringify(mockConfig));
    
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789' };
    const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => ({}) as any);
    
    await customerNotificationService.triggerNotification('QUOTATION', data);
    
    expect(windowSpy).not.toHaveBeenCalled();
  });

  it('should rate limit notifications', async () => {
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789' };
    const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    
    // Mock recent log
    (dbService.getAll as any).mockResolvedValue([{
      type: 'QUOTATION',
      entityId: '123',
      timestamp: new Date().toISOString()
    }]);

    await customerNotificationService.triggerNotification('QUOTATION', data);
    
    expect(windowSpy).not.toHaveBeenCalled();
  });

  it('should not open messaging when the user cancels the prompt', async () => {
    const data = { id: '123', customerName: 'John Doe', phoneNumber: '123456789' };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await customerNotificationService.triggerNotification('RECEIPT', data);

    expect(confirmSpy).toHaveBeenCalled();
    expect(windowSpy).not.toHaveBeenCalled();
    expect(dbService.put).toHaveBeenCalledWith('customerNotificationLogs', expect.objectContaining({
      customerName: 'John Doe',
      type: 'RECEIPT',
      status: 'cancelled'
    }));
  });
});
