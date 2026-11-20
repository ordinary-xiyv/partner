import { useEffect, useMemo, useState } from 'react';
import { Button, Spin } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { fetchCatalogModels } from '../../api/catalog';
import type { CatalogCardDTO, PlazaBannerPublic } from '../../types/catalog';
import { AppEmpty } from '../../ui/appLayout';
import { PlazaHeroBanner } from '../../components/model/PlazaHeroBanner';

const FEATURED_CATEGORY_ORDER = ['llm', 'image', 'video', 'audio', 'embedding'];

interface FeaturedPlazaViewProps {
  banners: PlazaBannerPublic[];
  providerIconByKey: Record<string, string>;
  onViewDetail?: (catalogId: number) => void;
}

export function FeaturedPlazaView({ banners, providerIconByKey, onViewDetail }: FeaturedPlazaViewProps) {
  const { t } = useTranslation();
  const [models, setModels] = useState<CatalogCardDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const pageSize = 100;
      const collected: CatalogCardDTO[] = [];
      let page = 1;
      let total = 0;
      do {
        const modelRes = await fetchCatalogModels({
          featured: true,
          include_unavailable: false,
          page,
          page_size: pageSize,
        });
        total = modelRes.total ?? 0;
        collected.push(...(modelRes.items || []).filter((m) => m.featured));
        if (!(modelRes.items || []).length || collected.length >= total || page >= 20) break;
        page += 1;
      } while (collected.length < total);
      setModels(collected);
    } catch {
      setModels([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => {
    const byCat = new Map<string, CatalogCardDTO[]>();
    for (const model of models) {
      const key = model.category || 'llm';
      const list = byCat.get(key) ?? [];
      list.push(model);
      byCat.set(key, list);
    }
    const seen = new Set<string>();
    const ordered: { key: string; items: CatalogCardDTO[] }[] = [];
    for (const key of FEATURED_CATEGORY_ORDER) {
      const items = byCat.get(key);
      if (!items?.length) continue;
      seen.add(key);
      ordered.push({ key, items });
    }
    for (const [key, items] of byCat) {
      if (seen.has(key) || items.length === 0) continue;
      ordered.push({ key, items });
    }
    return ordered;
  }, [models]);

  const hero = banners.length > 0 ? (
    <PlazaHeroBanner banners={banners} variant="hero" onOpen={onViewDetail} />
  ) : null;

  if (loading) {
    return (
      <div className="plaza-featured">
        {hero}
        <div className="model-plaza-grid__state">
          <Spin />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="plaza-featured">
        {hero}
        <div className="model-plaza-grid__state model-plaza-grid__state--error">
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void load()}>
            {t('modelPlaza.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!hero && groups.length === 0) {
    return (
      <div className="model-plaza-grid__state">
        <AppEmpty message={t('dashboard.noRecommendedModels')} />
      </div>
    );
  }

  return (
    <div className="plaza-featured">
      {hero}
      <div className="plaza-featured-groups">
        {groups.map((group) => (
          <section key={group.key} className="plaza-featured-group">
            <h3>{t(`catalog.category.${group.key}`, { defaultValue: group.key })}</h3>
            {group.items.map((model) => {
              const icon = providerIconByKey[model.provider_key];
              return (
                <button
                  key={model.id}
                  type="button"
                  className="plaza-featured-row"
                  onClick={() => onViewDetail?.(model.id)}
                >
                  {icon ? (
                    <img src={icon} alt="" className="plaza-featured-row__logo" />
                  ) : (
                    <span className="plaza-featured-row__logo-fallback" aria-hidden>
                      {(model.provider || model.name).slice(0, 1)}
                    </span>
                  )}
                  <span className="plaza-featured-row__text">
                    <strong>{model.name}</strong>
                    <p>{model.description || ''}</p>
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
