import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AppEmpty } from '../../ui/appLayout';
import type { CatalogCardDTO } from '../../types/catalog';
import { ModelCard } from './ModelCard';
import { ModelCardSkeleton } from './ModelCardSkeleton';

const SKELETON_COUNT = 6;

export interface ModelCardGridProps {
  items: CatalogCardDTO[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  onLoadMore: () => void;
  onRetry: () => void;
  providerIconByKey: Record<string, string>;
  onViewDetail?: (catalogId: number) => void;
  leading?: ReactNode;
}

export function ModelCardGrid({
  items,
  loading,
  loadingMore,
  hasMore,
  error,
  onLoadMore,
  onRetry,
  providerIconByKey,
  onViewDetail,
  leading,
}: ModelCardGridProps) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loading || !hasMore || error) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      {
        root: el.closest('.model-plaza__pane') ?? el.closest('.model-plaza__content'),
        rootMargin: '200px',
        threshold: 0,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, hasMore, onLoadMore, items.length, error]);

  if (loading && items.length === 0) {
    return (
      <div className="model-plaza-grid">
        <div className="model-plaza-grid__cards">
          {leading}
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <ModelCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="model-plaza-grid">
        {leading ? <div className="model-plaza-grid__cards">{leading}</div> : null}
        <div className="model-plaza-grid__state model-plaza-grid__state--error">
          <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
            {t('modelPlaza.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!loading && !error && items.length === 0) {
    return (
      <div className="model-plaza-grid">
        {leading ? <div className="model-plaza-grid__cards">{leading}</div> : null}
        <div className="model-plaza-grid__state">
          <AppEmpty message={t('modelPlaza.noResults')} />
        </div>
      </div>
    );
  }

  return (
    <div className="model-plaza-grid">
      <div className="model-plaza-grid__cards">
        {leading}
        {items.map((card) => (
          <ModelCard
            key={card.id}
            card={card}
            providerIconUri={providerIconByKey[card.provider_key]}
            onViewDetail={onViewDetail}
          />
        ))}
      </div>
      <div ref={sentinelRef} className="model-plaza-grid__sentinel" aria-hidden />
      {loadingMore ? (
        <div className="model-plaza-grid__more">
          <Spin />
        </div>
      ) : null}
      {error && items.length > 0 ? (
        <div className="model-plaza-grid__more-error">
          <Button size="small" icon={<ReloadOutlined />} onClick={onRetry}>
            {t('modelPlaza.retry')}
          </Button>
        </div>
      ) : null}
      {!hasMore && items.length > 0 && !error ? (
        <p className="model-plaza-grid__end">{t('modelPlaza.allLoaded')}</p>
      ) : null}
    </div>
  );
}
