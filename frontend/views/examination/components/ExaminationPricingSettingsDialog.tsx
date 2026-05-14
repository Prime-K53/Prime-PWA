import React, { useEffect, useMemo, useState } from 'react';
import { examinationBatchService } from '../../../services/examinationBatchService';
import { dbService } from '../../../services/db';
import { Button } from '../../../components/Button';
import { Select } from '../../../components/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/Dialog';
import { ExaminationBatch, Item, MarketAdjustment } from '../../../types';
import { isMarketAdjustmentActive } from '../../../utils/marketAdjustmentUtils';
import { AlertCircle, RefreshCw, Save, Settings2, Truck } from 'lucide-react';
import { calculateBatchPricing, PricingSettings } from '../../../utils/examinationPricingCalculator';



type PreviewMetrics = ReturnType<typeof calculateBatchPricing>;

const buildPreview = (
  batch: ExaminationBatch | null | undefined,
  settings: PricingSettings | null,
  activeAdjustments: MarketAdjustment[]
): PreviewMetrics => {
  return calculateBatchPricing(batch, settings, activeAdjustments);
};

const isPaperCandidate = (item: Item) => {
  const hint = `${String(item.name || '')} ${String(item.category || '')} ${String((item as any).material || '')}`.toLowerCase();
  return hint.includes('paper');
};

const isTonerCandidate = (item: Item) => {
  const hint = `${String(item.name || '')} ${String(item.category || '')} ${String((item as any).material || '')}`.toLowerCase();
  return hint.includes('toner');
};

export const ExaminationPricingSettingsDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  batch?: ExaminationBatch | null;
  onSaved?: () => void | Promise<void>;
  onPreviewChange?: (settings: PricingSettings | null, activeAdjustments: MarketAdjustment[]) => void;
  // NEW: Optional external data from parent (ExaminationBatchDetail)
  externalSettings?: PricingSettings | null;
  externalInventoryItems?: Item[];
  externalMarketAdjustments?: MarketAdjustment[];
  externalLoading?: boolean;
  onSaveSettings?: (settings: PricingSettings) => Promise<void>;
}> = ({
  isOpen,
  onClose,
  batch,
  onSaved,
  onPreviewChange,
  // NEW: External data props
  externalSettings,
  externalInventoryItems,
  externalMarketAdjustments,
  externalLoading = false,
  onSaveSettings
}) => {
    // Use external data when provided, otherwise manage internally
    const [internalSettings, setInternalSettings] = useState<PricingSettings | null>(null);
    const [internalInventoryItems, setInternalInventoryItems] = useState<Item[]>([]);
    const [internalMarketAdjustments, setInternalMarketAdjustments] = useState<MarketAdjustment[]>([]);
    const [internalLoading, setInternalLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Determine if using external data (parent-controlled) or internal state
    const isExternal = externalSettings !== undefined && externalInventoryItems !== undefined;

    // Use external values when provided, fall back to internal state
    const settings = isExternal ? externalSettings : internalSettings;
    const inventoryItems = isExternal ? externalInventoryItems : internalInventoryItems;
    const marketAdjustments = externalMarketAdjustments ?? internalMarketAdjustments;
    const loading = isExternal ? externalLoading : internalLoading;

    const currency = batch?.currency || 'MWK';
    const activeMarketAdjustments = useMemo(
      () => (marketAdjustments || [])
        .filter(isMarketAdjustmentActive),
      [marketAdjustments]
    );
    const preview = useMemo(
      () => buildPreview(batch, settings, activeMarketAdjustments),
      [batch, settings, activeMarketAdjustments]
    );

    // Internal state setters (only used when not external)
    const setSettings = isExternal ? () => { } : setInternalSettings;
    const setInventoryItems = isExternal ? () => { } : setInternalInventoryItems;
    const setMarketAdjustments = isExternal ? () => { } : setInternalMarketAdjustments;
    const setLoading = isExternal ? () => { } : setInternalLoading;

    const loadSettings = async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsData, inventoryData, marketAdjustmentsData] = await Promise.all([
          examinationBatchService.getPricingSettings(),
          dbService.getAll<Item>('inventory'),
          dbService.getAll<MarketAdjustment>('marketAdjustments')
        ]);

        const inventoryItemsList = Array.isArray(inventoryData) ? inventoryData : [];
        setInventoryItems(inventoryItemsList);
        setMarketAdjustments(Array.isArray(marketAdjustmentsData) ? marketAdjustmentsData : []);

        // If settings are missing defaults, try to find them in inventory
        if (settingsData) {
          if (!settingsData.paper_item_id) {
            const defaultPaper = inventoryItemsList.find(i =>
              i.name.toLowerCase().includes('a4 paper') && i.name.toLowerCase().includes('80gsm')
            );
            if (defaultPaper) {
              settingsData.paper_item_id = defaultPaper.id;
              settingsData.paper_item_name = defaultPaper.name;
              settingsData.paper_unit_cost = Number((defaultPaper as any).cost_per_unit ?? defaultPaper.cost ?? 0);
            }
          }

          if (!settingsData.toner_item_id) {
            const defaultToner = inventoryItemsList.find(i =>
              i.name.toLowerCase().includes('hp universal toner') && i.name.toLowerCase().includes('1kg')
            );
            if (defaultToner) {
              settingsData.toner_item_id = defaultToner.id;
              settingsData.toner_item_name = defaultToner.name;
              settingsData.toner_unit_cost = Number((defaultToner as any).cost_per_unit ?? defaultToner.cost ?? 0);
            }
          }
        }

        setSettings(settingsData);
      } catch (loadError) {
        console.error('Error loading examination pricing settings:', loadError);
        setError('Failed to load pricing settings.');
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      if (isOpen) {
        void loadSettings();
      }
    }, [isOpen]);

    useEffect(() => {
      if (!onPreviewChange) return;
      if (!isOpen) {
        onPreviewChange(null, []);
        return;
      }

      onPreviewChange(settings, activeMarketAdjustments);
    }, [activeMarketAdjustments, isOpen, onPreviewChange, settings]);

    const handleSave = async () => {
      if (!settings) return;

      // If using external data and onSaveSettings is provided, use parent's save logic
      if (isExternal && onSaveSettings) {
        setSaving(true);
        try {
          await onSaveSettings(settings);
          if (onSaved) {
            await onSaved();
          }
          onClose();
        } catch (saveError) {
          console.error('Error saving via parent:', saveError);
          setError('Failed to save pricing settings.');
        } finally {
          setSaving(false);
        }
        return;
      }

      // Internal save logic (when not using external data)
      setSaving(true);
      setError(null);
      try {
        // Step 1: Save the pricing settings
        await examinationBatchService.updatePricingSettings({
          paper_item_id: settings.paper_item_id,
          toner_item_id: settings.toner_item_id,
          trigger_recalculate: false,
          lock_pricing_snapshot: Boolean(batch?.id),
          lock_batch_id: batch?.id || undefined,
          lock_reason: batch?.id ? 'Saved via examination pricing settings' : undefined
        });

        // Step 2: Sync pricing to batch classes (Bidirectional Data Consistency)
        // This populates the three critical financial metrics for all classes
        if (batch?.id) {
          try {
            const syncSettings = {
              paper_item_id: settings.paper_item_id,
              paper_item_name: settings.paper_item_name,
              paper_unit_cost: settings.paper_unit_cost,
              toner_item_id: settings.toner_item_id,
              toner_item_name: settings.toner_item_name,
              toner_unit_cost: settings.toner_unit_cost,
              conversion_rate: settings.conversion_rate,
              constants: {
                pages_per_sheet: 2,
                toner_pages_per_unit: settings.constants?.toner_pages_per_unit || 20000,
                default_paper_conversion_rate: settings.conversion_rate || 500
              },
              active_adjustments: settings.active_adjustments || []
            };

            const syncResult = await examinationBatchService.syncPricingToBatch(
              batch.id,
              {
                settings: syncSettings,
                adjustments: activeMarketAdjustments,
                triggerSource: 'PRICING_SETTINGS_SYNC'
              }
            );

            if (!syncResult.success) {
              console.warn('[ExaminationPricingSettings] Sync completed with errors:', syncResult.errors);
            }
          } catch (syncError) {
            console.error('[ExaminationPricingSettings] Failed to sync pricing to classes:', syncError);
            // Don't fail the save if sync fails, but show a warning
            setError('Settings saved, but failed to sync to some classes. Please recalculate the batch.');
          }
        }

        if (onSaved) {
          await onSaved();
        }
        onClose();
      } catch (saveError) {
        console.error('Error saving examination pricing settings:', saveError);
        setError('Failed to save pricing settings.');
      } finally {
        setSaving(false);
      }
    };

    const paperOptions = useMemo(
      () => inventoryItems.filter(isPaperCandidate),
      [inventoryItems]
    );

    const tonerOptions = useMemo(
      () => inventoryItems.filter(isTonerCandidate),
      [inventoryItems]
    );

    const handlePaperSelection = (value: string) => {
      if (!settings) return;
      const selected = inventoryItems.find((item) => String(item.id) === String(value));
      setSettings({
        ...settings,
        paper_item_id: value || null,
        paper_item_name: selected ? selected.name : null,
        paper_unit_cost: selected ? Number((selected as any).cost_per_unit ?? selected.cost ?? selected.cost_price ?? 0) : 0
      });
    };

    const handleTonerSelection = (value: string) => {
      if (!settings) return;
      const selected = inventoryItems.find((item) => String(item.id) === String(value));
      setSettings({
        ...settings,
        toner_item_id: value || null,
        toner_item_name: selected ? selected.name : null,
        toner_unit_cost: selected ? Number((selected as any).cost_per_unit ?? selected.cost ?? selected.cost_price ?? 0) : 0
      });
    };

    if (!isOpen) return null;

    return (
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="w-full max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-blue-600" />
              Examination Pricing Settings
            </DialogTitle>
            <p className="text-sm text-slate-600 mt-1">
              Configure global hidden BOM defaults and review a live preview for this batch.
            </p>
          </DialogHeader>

          <div className="p-6 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-sm text-slate-500 py-6 text-center">Loading pricing settings...</div>
            ) : settings ? (
              <>
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Hidden BOM (Automatic Cost Calculation)</h3>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Select
                      label="Paper Item"
                      value={settings.paper_item_id || ''}
                      onChange={(event) => handlePaperSelection(event.target.value)}
                    >
                      <option value="">No paper default</option>
                      {paperOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label="Toner Item"
                      value={settings.toner_item_id || ''}
                      onChange={(event) => handleTonerSelection(event.target.value)}
                    >
                      <option value="">No toner default</option>
                      {tonerOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </section>

                <section className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                  <div className="flex flex-col gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-indigo-900">Active Market Adjustments</h4>
                      <p className="text-xs text-indigo-600 mb-2">Automated system-wide pricing adjustments</p>

                      <div className="flex flex-wrap gap-2">
                        {activeMarketAdjustments.length > 0 ? (
                          activeMarketAdjustments.map((rule) => (
                            <div key={rule.id} className="px-3 py-1.5 border border-indigo-200 rounded-lg text-xs bg-indigo-100 text-indigo-900 font-medium flex items-center gap-2">
                              <Truck className="w-3 h-3" />
                              {rule.name}
                              <span className="bg-white px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                                {rule.type === 'PERCENTAGE' || rule.type === 'PERCENT' || rule.type === 'percentage'
                                  ? `+${rule.value}%`
                                  : `+${currency}${rule.value}`}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500 italic text-sm">No active market adjustments found</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                  <h3 className="text-sm font-semibold text-blue-900">Live Batch Preview</h3>
                  {preview.classes.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No classes available for preview.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {preview.classes.map((classPreview) => (
                        <div key={classPreview.classId} className="rounded-lg border border-blue-100 bg-white p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-slate-900">{classPreview.className}</h4>
                            <span className="text-xs font-medium text-blue-800">{classPreview.learners.toLocaleString()} learners</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                            <div className="rounded-md bg-blue-50/60 px-3 py-2 border border-blue-100">
                              <div className="text-xs text-slate-500">Total Sheets</div>
                              <div className="font-semibold text-slate-900">{classPreview.totalSheets.toLocaleString()}</div>
                            </div>
                            <div className="rounded-md bg-blue-50/60 px-3 py-2 border border-blue-100">
                              <div className="text-xs text-slate-500">Total Pages</div>
                              <div className="font-semibold text-slate-900">{classPreview.totalPages.toLocaleString()}</div>
                            </div>
                            <div className="rounded-md bg-blue-50/60 px-3 py-2 border border-blue-100">
                              <div className="text-xs text-slate-500">Total BOM Cost</div>
                              <div className="font-semibold text-slate-900">{classPreview.totalBomCost.toLocaleString()}</div>
                            </div>
                            <div className="rounded-md bg-blue-50/60 px-3 py-2 border border-blue-100">
                              <div className="text-xs text-slate-500">Total Adjustments</div>
                              <div className="font-semibold text-slate-900">{classPreview.totalAdjustments.toLocaleString()}</div>
                            </div>
                            <div className="rounded-md bg-blue-50/60 px-3 py-2 border border-blue-100">
                              <div className="text-xs text-slate-500">Total Cost</div>
                              <div className="font-semibold text-slate-900">{classPreview.totalCost.toLocaleString()}</div>
                            </div>
                            <div className="rounded-md bg-white px-3 py-2 border border-blue-200">
                              <div className="text-xs text-slate-500">Expected Fee per Learner</div>
                              <div className="font-semibold text-blue-900">{classPreview.expectedFeePerLearner.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => { void loadSettings(); }}
                    disabled={loading || saving}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button
                    onClick={() => { void handleSave(); }}
                    disabled={saving || loading}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    );
  };
