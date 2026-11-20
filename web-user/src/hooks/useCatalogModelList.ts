import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { buildCatalogListQueryParams, fetchCatalogModels } from '../api/catalog';
import { notifyApiErrorFromErr } from '../lib/notifyApi';
import { useDebouncedValue } from './useDebouncedValue';
import type { CatalogCardDTO, CatalogListFilters } from '../types/catalog';
import { CATALOG_PAGE_SIZE } from '../types/catalog';

function filtersKey(filters: CatalogListFilters): string {
  return JSON.stringify({
    category: filters.category,
    provider: filters.provider,
    group: filters.group,
    tags: [...filters.tags].sort(),
    pricingType: filters.pricingType,
    search: filters.search.trim(),
  });
}

export function useCatalogModelList(
  filters: CatalogListFilters,
  pageSize = CATALOG_PAGE_SIZE,
  enabled = true,
) {
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const filterKey = filtersKey({ ...filters, search: debouncedSearch });

  const filtersRef = useRef<CatalogListFilters>({ ...filters, search: debouncedSearch });
  filtersRef.current = { ...filters, search: debouncedSearch };

  const [items, setItems] = useState<CatalogCardDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const pageRef = useRef(1);

  const fetchPage = useCallback(async (targetPage: number, append: boolean) => {
    const reqId = ++requestIdRef.current;
    if (targetPage === 1) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = buildCatalogListQueryParams(filtersRef.current, targetPage, pageSize);
      const { items: batch, total: t } = await fetchCatalogModels(params);
      if (reqId !== requestIdRef.current) return;

      setTotal(t);
      pageRef.current = targetPage;
      setPage(targetPage);
      setItems((prev) => {
        const merged = append ? [...prev, ...batch] : batch;
        setHasMore(merged.length < t);
        return merged;
      });
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      const msg = e instanceof Error ? e.message : 'Failed to load models';
      setError(msg);
      if (targetPage === 1) {
        setItems([]);
        setHasMore(false);
      }
      notifyApiErrorFromErr(e, { fallbackKey: 'notify.operationFailed' });
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [pageSize]);

  useLayoutEffect(() => {
    if (!enabled) return;
    setItems([]);
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    void fetchPage(1, false);
    // 仅 filterKey 变化时重新拉取；勿把「每帧新建的对象 filters」放进 fetchPage 的 deps
  }, [filterKey, fetchPage, enabled]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || error) return;
    void fetchPage(pageRef.current + 1, true);
  }, [loading, loadingMore, hasMore, error, fetchPage]);

  const refresh = useCallback(() => {
    setItems([]);
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    void fetchPage(1, false);
  }, [fetchPage]);

  return {
    items,
    total,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}
