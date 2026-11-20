import { useCallback, useEffect, useState } from 'react';
import { fetchCatalogModelById } from '../api/catalog';
import { notifyApiErrorFromErr } from '../lib/notifyApi';
import type { CatalogDetailDTO } from '../types/catalog';

export function useCatalogModelDetail(catalogId?: number, enabled = true) {
  const [detail, setDetail] = useState<CatalogDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled || catalogId == null) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCatalogModelById(catalogId);
      setDetail(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load model detail';
      setError(msg);
      setDetail(null);
      notifyApiErrorFromErr(e, { fallbackKey: 'notify.operationFailed' });
    } finally {
      setLoading(false);
    }
  }, [catalogId, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, loading, error, reload: load };
}
