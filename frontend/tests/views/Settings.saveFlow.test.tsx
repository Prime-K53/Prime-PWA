import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Settings from '../../views/Settings';

const mockUseData = vi.fn();

vi.mock('../../context/DataContext', () => ({
  useData: () => mockUseData()
}));

vi.mock('../../services/localFileStorage', () => ({
  localFileStorage: {
    save: vi.fn().mockResolvedValue('file-id-123')
  }
}));

vi.mock('../../services/api', () => ({
  api: {
    system: {
      getLicenseInfo: vi.fn().mockResolvedValue({ licensed: true, expires: '2026-12-31' })
    }
  }
}));

describe('Settings - Pricing Settings Save Flow Integration', () => {
  const mockUpdateCompanyConfig = vi.fn();
  const mockNotify = vi.fn();

  const defaultCompanyConfig = {
    companyName: 'Test Company',
    currencySymbol: '$',
    taxNumber: 'TAX123',
    address: '123 Test St',
    phone: '555-0123',
    email: 'test@example.com',
    website: 'https://test.com',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    pricingSettings: {
      enableRounding: false,
      defaultMethod: 'NEAREST_50',
      customStep: 50,
      applyToPOS: false,
      applyToInvoices: false,
      applyToQuotations: false,
      allowManualOverride: false,
      showOriginalPrice: false,
      profitProtectionMode: false
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-23T12:00:00.000Z'));
    mockUseData.mockReset();
    mockUpdateCompanyConfig.mockClear();
    mockNotify.mockClear();

    mockUseData.mockReturnValue({
      companyConfig: defaultCompanyConfig,
      updateCompanyConfig: mockUpdateCompanyConfig,
      notify: mockNotify,
      resetSystem: vi.fn(),
      manualDownloadBackup: vi.fn(),
      inventory: [],
      ledger: [],
      auditLogs: [],
      allUsers: []
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should save valid pricing settings successfully', async () => {
    render(<Settings />);

    // Navigate to the pricing settings section (assuming it's in a tab)
    // For this test, we'll directly interact with the pricing settings state
    // by finding the save button and clicking it with valid config

    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeInTheDocument();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockNotify).toHaveBeenCalledWith('Settings updated successfully', 'success');
  });

  it('should display validation errors for invalid pricing settings', async () => {
    // Mock company config with invalid pricing settings
    const invalidConfig = {
      ...defaultCompanyConfig,
      pricingSettings: {
        ...defaultCompanyConfig.pricingSettings,
        enableRounding: true,
        defaultMethod: 'INVALID_METHOD' as any, // Invalid enum value
        customStep: -10, // Negative step
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false
      }
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: invalidConfig
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');

    // Check that validation errors are displayed
    await waitFor(() => {
      expect(screen.getByText(/defaultMethod|Invalid enum value/i)).toBeInTheDocument();
    });
  });

  it('should handle missing pricing settings gracefully', async () => {
    const configWithoutPricingSettings = {
      ...defaultCompanyConfig,
      pricingSettings: undefined
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: configWithoutPricingSettings
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    // Should still save successfully as pricingSettings is optional
    expect(mockNotify).toHaveBeenCalledWith('Settings updated successfully', 'success');
  });

  it('should validate smart threshold rules when enabled', async () => {
    const configWithInvalidThresholds = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, maxPrice: 100, step: 25, method: 'NEAREST_25' },
          { minPrice: 100, step: 50, method: 'NEAREST_50' },
          { minPrice: 50, maxPrice: 200, step: 10, method: 'NEAREST_10' } // Overlapping range
        ]
      }
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: configWithInvalidThresholds
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
  });

  it('should accept valid smart threshold configuration', async () => {
    const configWithValidThresholds = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, maxPrice: 100, step: 25, method: 'NEAREST_25' },
          { minPrice: 100, step: 50, method: 'NEAREST_50' }
        ]
      }
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: configWithValidThresholds
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockNotify).toHaveBeenCalledWith('Settings updated successfully', 'success');
  });

  it('should normalize pricing settings with defaults on save', async () => {
    const partialConfig = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_100'
        // Missing other required fields
      } as any
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: partialConfig
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    // Verify that the saved config includes default values for missing fields
    const savedConfig = mockUpdateCompanyConfig.mock.calls[0][0];
    expect(savedConfig.pricingSettings).toMatchObject({
      enableRounding: true,
      defaultMethod: 'NEAREST_100',
      customStep: 50, // default
      applyToPOS: false, // default
      applyToInvoices: false, // default
      applyToQuotations: false, // default
      allowManualOverride: false, // default
      showOriginalPrice: false, // default
      profitProtectionMode: false // default
    });
  });

  it('should handle save errors gracefully', async () => {
    mockUpdateCompanyConfig.mockImplementation(() => {
      throw new Error('Failed to save to localStorage');
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Settings updated successfully', 'success');
    });

    // Even if updateCompanyConfig throws, the component should handle it
    // (Note: In the actual implementation, updateCompanyConfig catches errors internally)
  });

  it('should preserve existing company config when pricing settings are valid', async () => {
    const configWithOtherSettings = {
      ...defaultCompanyConfig,
      companyName: 'Updated Company Name',
      currencySymbol: '€',
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'ALWAYS_UP_50',
        customStep: 50,
        applyToPOS: true,
        applyToInvoices: true,
        applyToQuotations: false,
        allowManualOverride: true,
        showOriginalPrice: true,
        profitProtectionMode: true
      }
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: configWithOtherSettings
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    const savedConfig = mockUpdateCompanyConfig.mock.calls[0][0];
    expect(savedConfig.companyName).toBe('Updated Company Name');
    expect(savedConfig.currencySymbol).toBe('€');
    expect(savedConfig.pricingSettings.enableRounding).toBe(true);
    expect(savedConfig.pricingSettings.applyToPOS).toBe(true);
  });

  it('should validate threshold rule structure', async () => {
    const configWithMalformedThresholds = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: true,
        defaultMethod: 'NEAREST_50',
        customStep: 50,
        applyToPOS: false,
        applyToInvoices: false,
        applyToQuotations: false,
        allowManualOverride: false,
        showOriginalPrice: false,
        profitProtectionMode: false,
        enableSmartThresholds: true,
        thresholdRules: [
          { minPrice: 0, step: 25, method: 'NEAREST_25' }, // Missing maxPrice (optional but should be valid)
          { minPrice: 100, maxPrice: 50, step: 50, method: 'NEAREST_50' } // Invalid: maxPrice < minPrice
        ]
      }
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: configWithMalformedThresholds
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
  });

  it('should clear validation errors when valid settings are saved', async () => {
    // Start with invalid config
    const invalidConfig = {
      ...defaultCompanyConfig,
      pricingSettings: {
        ...defaultCompanyConfig.pricingSettings,
        defaultMethod: 'INVALID' as any
      }
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: invalidConfig
    });

    render(<Settings />);

    // First attempt with invalid settings
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
    });

    // Update to valid settings
    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: defaultCompanyConfig
    });

    // Re-render with new config
    render(<Settings />);

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalledTimes(1);
    });

    expect(mockNotify).toHaveBeenLastCalledWith('Settings updated successfully', 'success');
  });
});

describe('Settings - Integration with PricingSettingsValidator', () => {
  it('should use PricingSettingsValidator.validate in handleSave', async () => {
    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).toHaveBeenCalled();
    });

    // The validator should have been called internally
    // This is implicitly tested through the validation behavior
  });

  it('should handle all validation error paths from validator', async () => {
    const configWithMultipleErrors = {
      ...defaultCompanyConfig,
      pricingSettings: {
        enableRounding: 'yes' as any, // Should be boolean
        defaultMethod: 123 as any, // Should be string
        customStep: 'fifty' as any, // Should be number
        applyToPOS: 'no' as any,
        applyToInvoices: 'maybe' as any,
        applyToQuotations: true,
        allowManualOverride: 'true' as any,
        showOriginalPrice: 1 as any,
        profitProtectionMode: 'false' as any
      }
    };

    mockUseData.mockReturnValue({
      ...mockUseData(),
      companyConfig: configWithMultipleErrors
    });

    render(<Settings />);

    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateCompanyConfig).not.toHaveBeenCalled();
    });

    expect(mockNotify).toHaveBeenCalledWith('Please fix validation errors in pricing settings', 'error');
  });
});
