import { useCallback, useEffect, useState } from 'react';
import { fetchCatalogFilters } from '../api/catalog';
import type { CatalogFiltersDTO } from '../types/catalog';
import { notifyApiErrorFromErr } from '../lib/notifyApi';

export function useCatalogFilters(enabled = true) {
  const [filters, setFilters] = useState<CatalogFiltersDTO | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCatalogFilters();
      setFilters(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load filters';
      setError(msg);
      notifyApiErrorFromErr(e, { fallbackKey: 'notify.operationFailed' });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { filters, loading, error, reload };
}
