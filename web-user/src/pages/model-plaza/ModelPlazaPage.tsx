import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Header from '../../components/Header';
import { useAppSidebar } from '../../contexts/AppSidebarContext';
import { ModelCardGrid } from '../../components/model/ModelCardGrid';
import { ModelCategoryTabs, type PlazaViewTab } from '../../components/model/ModelCategoryTabs';
import { ModelFilterSidebar } from '../../components/model/ModelFilterSidebar';
import { ModelDetailDrawer } from '../../components/model/ModelDetailDrawer';
import { PlazaHeroBanner } from '../../components/model/PlazaHeroBanner';
import { fetchCatalogProviders, fetchPlazaBanners } from '../../api/catalog';
import { FeaturedPlazaView } from './FeaturedPlazaView';
import { useCatalogFilters } from '../../hooks/useCatalogFilters';
import { useCatalogModelList } from '../../hooks/useCatalogModelList';
import {
  DEFAULT_CATALOG_LIST_FILTERS,
  type CatalogListFilters,
  type CatalogProviderPublic,
  type PlazaBannerPublic,
} from '../../types/catalog';
import { countActiveFilters } from './countActiveFilters';
import './model-plaza.css';

function parseOpenCatalogId(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default function ModelPlazaPage() {
  const { t } = useTranslation();
  const embedInConsole = Boolean(useAppSidebar());
  const [searchParams, setSearchParams] = useSearchParams();
  const [allTabVisited, setAllTabVisited] = useState(false);
  const [plazaTab, setPlazaTab] = useState<PlazaViewTab>('featured');
  const [banners, setBanners] = useState<PlazaBannerPublic[]>([]);

  const handlePlazaTabChange = useCallback((tab: PlazaViewTab) => {
    setPlazaTab(tab);
    if (tab === 'all') setAllTabVisited(true);
  }, []);

  const {
    filters: filtersMeta,
    loading: filtersLoading,
    error: filtersError,
    reload: reloadFilters,
  } = useCatalogFilters(allTabVisited);

  const [listFilters, setListFilters] = useState<CatalogListFilters>(DEFAULT_CATALOG_LIST_FILTERS);
  const [detailCatalogId, setDetailCatalogId] = useState<number | undefined>(() =>
    parseOpenCatalogId(searchParams.get('open')),
  );
  const [detailOpen, setDetailOpen] = useState(
    () => parseOpenCatalogId(searchParams.get('open')) !== undefined,
  );
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  );
  const [providers, setProviders] = useState<CatalogProviderPublic[]>([]);

  const {
    items,
    loading,
    loadingMore,
    hasMore,
    error: listError,
    loadMore,
    refresh: refreshList,
  } = useCatalogModelList(listFilters, undefined, allTabVisited);

  const activeFilterCount = useMemo(() => countActiveFilters(listFilters), [listFilters]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setShowMobileFilters(false);
  }, [isMobile]);

  useEffect(() => {
    if (!showMobileFilters || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMobileFilters(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [showMobileFilters, isMobile]);

  useEffect(() => {
    fetchCatalogProviders()
      .then(setProviders)
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    fetchPlazaBanners(3)
      .then((rows) =>
        setBanners((rows || []).filter((row) => row.image_url || row.display_name).slice(0, 3)),
      )
      .catch(() => setBanners([]));
  }, []);

  useEffect(() => {
    const id = parseOpenCatalogId(searchParams.get('open'));
    if (id !== undefined) {
      setDetailCatalogId(id);
      setDetailOpen(true);
    } else {
      setDetailCatalogId(undefined);
      setDetailOpen(false);
    }
  }, [searchParams]);

  const providerIconByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of providers) {
      if (p.icon_data_uri) map[p.provider_key] = p.icon_data_uri;
    }
    return map;
  }, [providers]);

  const handleSearchChange = useCallback((search: string) => {
    setListFilters((prev) => ({ ...prev, search }));
  }, []);

  const openDetail = useCallback(
    (catalogId: number) => {
      if (!Number.isFinite(catalogId) || catalogId <= 0) return;
      setDetailCatalogId(catalogId);
      setDetailOpen(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('open', String(catalogId));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailCatalogId(undefined);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const detailProviderIcon =
    detailCatalogId != null
      ? items.find((c) => c.id === detailCatalogId)?.provider_key
      : undefined;

  return (
    <div className={embedInConsole ? 'model-plaza model-plaza--console' : 'model-plaza'}>
      {embedInConsole ? null : <Header />}

      <div className="model-plaza__scroll">
      <div className="model-plaza__body">
        <div className="model-plaza__toolbar">
          <ModelCategoryTabs
            search={listFilters.search}
            onSearchChange={handleSearchChange}
            activeTab={plazaTab}
            onTabChange={handlePlazaTabChange}
            showSearch={plazaTab === 'all'}
            afterTabs={
              plazaTab === 'all' && !isMobile ? (
                <Button
                  className="model-plaza__filter-toggle"
                  icon={filterCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setFilterCollapsed((v) => !v)}
                >
                  {filterCollapsed ? t('modelPlaza.expand') : t('modelPlaza.collapse')}
                  {filterCollapsed && activeFilterCount > 0 ? (
                    <span className="model-plaza__filter-badge">{activeFilterCount}</span>
                  ) : null}
                </Button>
              ) : null
            }
          />
        </div>

        {showMobileFilters && isMobile && plazaTab === 'all' ? (
          <div
            className="model-plaza__overlay"
            onClick={() => setShowMobileFilters(false)}
            aria-hidden
          />
        ) : null}

        <div className="model-plaza__main">
          {!isMobile ? (
            <ModelFilterSidebar
              filtersMeta={filtersMeta}
              value={listFilters}
              onChange={setListFilters}
              loading={filtersLoading}
              error={filtersError}
              onRetry={() => void reloadFilters()}
              isMobile={false}
              className={plazaTab !== 'all' || filterCollapsed ? 'model-plaza-filter--collapsed' : undefined}
              inactive={plazaTab !== 'all' || filterCollapsed}
            />
          ) : plazaTab === 'all' && showMobileFilters ? (
            <ModelFilterSidebar
              filtersMeta={filtersMeta}
              value={listFilters}
              onChange={setListFilters}
              loading={filtersLoading}
              error={filtersError}
              onRetry={() => void reloadFilters()}
              isMobile
              onClose={() => setShowMobileFilters(false)}
              className="model-plaza-filter--open"
            />
          ) : null}

          <div className="model-plaza__content">
            <div className="model-plaza__pane" hidden={plazaTab !== 'featured'}>
              <FeaturedPlazaView
                banners={banners}
                providerIconByKey={providerIconByKey}
                onViewDetail={openDetail}
              />
            </div>
            <div className="model-plaza__pane" hidden={plazaTab !== 'all'}>
            {isMobile ? (
              <button
                type="button"
                className="model-plaza__mobile-filter-btn"
                onClick={() => setShowMobileFilters(true)}
              >
                <FilterOutlined />
                {t('modelPlaza.filterTitle')}
                {activeFilterCount > 0 ? (
                  <span className="model-plaza__filter-badge">{activeFilterCount}</span>
                ) : null}
              </button>
            ) : null}

            <ModelCardGrid
              items={items}
              loading={loading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              error={listError}
              onLoadMore={loadMore}
              onRetry={refreshList}
              providerIconByKey={providerIconByKey}
              onViewDetail={openDetail}
              leading={
                banners.length > 0 ? (
                  <PlazaHeroBanner banners={banners} variant="cell" active={plazaTab === 'all'} onOpen={openDetail} />
                ) : null
              }
            />
            </div>
          </div>
        </div>
      </div>
      </div>

      <ModelDetailDrawer
        open={detailOpen}
        catalogId={detailCatalogId}
        providerIconUri={
          detailProviderIcon ? providerIconByKey[detailProviderIcon] : undefined
        }
        providerIconByKey={providerIconByKey}
        onClose={closeDetail}
        onLoadFailed={closeDetail}
      />
    </div>
  );
}
