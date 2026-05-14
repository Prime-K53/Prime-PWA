/**
 * getEffectiveMargin — Frontend utility
 *
 * Resolves the effective profit margin for a given product/order line
 * by calling the backend resolution endpoint (or falling back to a
 * locally-cached snapshot for offline mode).
 *
 * Hierarchy (highest → lowest priority):
 *   line_item  →  category  →  global  →  system default (0%)
 */

// Helper to get dynamic API base URL
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const apiUrl = (window as any).API_BASE_URL;
    if (apiUrl && apiUrl.trim()) {
      return apiUrl;
    }
  }
  return '';
};

export interface EffectiveMargin {
  margin_value: number;
  margin_type: 'percentage' | 'fixed_amount';
  source: 'line_item' | 'category' | 'global' | 'system';
  apply_volume_margins?: boolean;
}

/** In-memory cache keyed by `${lineItemId}|${categoryId}` */
const _cache = new Map<string, EffectiveMargin>();

/**
 * Resolve the effective margin for a line-item.
 *
 * @param lineItemId  SKU or product ID (optional)
 * @param categoryId  Category ID (optional)
 * @param useCache    Whether to use the in-memory request cache (default: true)
 */
export async function getEffectiveMargin(
  lineItemId?: string | null,
  categoryId?: string | null,
  useCache = true
): Promise<EffectiveMargin> {
  const cacheKey = `${lineItemId ?? ''}|${categoryId ?? ''}`;

  if (useCache && _cache.has(cacheKey)) {
    return _cache.get(cacheKey)!;
  }

  try {
    const params = new URLSearchParams();
    if (lineItemId) params.set('lineItemId', lineItemId);
    if (categoryId) params.set('categoryId', categoryId);

    const userId   = localStorage.getItem('prime_user_id') || 'guest';
    const userRole = localStorage.getItem('prime_user_role') || 'Viewer';

    const res = await fetch(
      `${getApiBaseUrl()}/settings/profit-margins/resolve?${params.toString()}`,
      {
        headers: {
          'x-user-id':   userId,
          'x-user-role': userRole,
        },
      }
    );

    if (!res.ok) {
      console.warn('[getEffectiveMargin] API returned', res.status, '— using system default');
      return _systemDefault();
    }

    const data: EffectiveMargin = await res.json();
    if (useCache) _cache.set(cacheKey, data);
    return data;

  } catch (err) {
    console.warn('[getEffectiveMargin] Network error — using system default:', err);
    return _systemDefault();
  }
}

/** Invalidate cached margin for a specific scope reference. */
export function invalidateMarginCache(lineItemId?: string, categoryId?: string) {
  if (!lineItemId && !categoryId) {
    _cache.clear();
    return;
  }
  for (const key of _cache.keys()) {
    const [li, cat] = key.split('|');
    if ((lineItemId && li === lineItemId) || (categoryId && cat === categoryId)) {
      _cache.delete(key);
    }
  }
}

/**
 * Apply a resolved margin to a base cost and return the selling price.
 *
 * @param baseCost     The raw cost amount
 * @param margin       The resolved EffectiveMargin object
 */
export function applyMargin(baseCost: number, margin: EffectiveMargin): number {
  if (margin.margin_type === 'percentage') {
    return baseCost * (1 + margin.margin_value / 100);
  }
  // fixed_amount
  return baseCost + margin.margin_value;
}

/**
 * Convenience: resolve + apply in a single call.
 */
export async function getSellingPrice(
  baseCost: number,
  lineItemId?: string | null,
  categoryId?: string | null
): Promise<{ sellingPrice: number; margin: EffectiveMargin }> {
  const margin = await getEffectiveMargin(lineItemId, categoryId);
  return { sellingPrice: applyMargin(baseCost, margin), margin };
}

function _systemDefault(): EffectiveMargin {
  return { margin_value: 0, margin_type: 'percentage', source: 'system', apply_volume_margins: false };
}
