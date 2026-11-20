import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchCatalogFilters, fetchCatalogModels, fetchCatalogProviders } from '../../../api/catalog';
import type { CatalogCardDTO, CatalogProviderPublic, KeyLabel } from '../../../types/catalog';
import { useHomePrimaryAction } from '../../home/hooks/useHomePrimaryAction';
import './home-alt-models.css';

const HOME_ALT_MODELS_PAGE_SIZE = 4;
const FEATURED_TAB_ID = 'featured';

interface ModelsTab {
  id: string;
  label: string;
  featured: boolean;
  category: string | undefined;
}

function truncateText(text: string, maxLen: number): string {
  const s = text.trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

function modelCardTags(model: CatalogCardDTO, t: (key: string) => string): string[] {
  const tags: string[] = [];
  for (const tag of model.tags || []) {
    if (tags.length >= 3) break;
    const trimmed = String(tag).trim();
    if (trimmed && !tags.includes(trimmed)) tags.push(trimmed);
  }
  if (tags.length === 0 && model.category) {
    const catKey = `catalog.category.${model.category}`;
    const label = t(catKey);
    tags.push(label === catKey ? model.category : label);
  }
  return tags.slice(0, 2);
}

export function HomeAltModelsSection() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { handlePrimary } = useHomePrimaryAction();

  const [categoryTabs, setCategoryTabs] = useState<ModelsTab[]>([]);
  const [activeTab, setActiveTab] = useState(FEATURED_TAB_ID);
  const [models, setModels] = useState<CatalogCardDTO[]>([]);
  const [providers, setProviders] = useState<CatalogProviderPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const hasLoadedRef = useRef(false);

  const tabs = useMemo<ModelsTab[]>(
    () => [
      { id: FEATURED_TAB_ID, label: t('homeAlt.tabFeatured'), featured: true, category: undefined },
      ...categoryTabs,
    ],
    [t, categoryTabs],
  );

  const activeMeta = useMemo<ModelsTab>(() => {
    return tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  }, [tabs, activeTab]);

  const providerIconByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of providers) {
      if (p.icon_data_uri) map[p.provider_key] = p.icon_data_uri;
    }
    return map;
  }, [providers]);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalogProviders()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalogFilters()
      .then((data) => {
        if (cancelled) return;
        setCategoryTabs(
          (data.categories || [])
            .filter((c: KeyLabel) => c.key && c.key !== 'all')
            .map((c) => ({
              id: c.key,
              label: t(`catalog.category.${c.key}`, { defaultValue: c.label }),
              featured: false,
              category: c.key,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setCategoryTabs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [t, i18n.language]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    let cancelled = false;
    if (!hasLoadedRef.current) setLoading(true);
    setError(false);
    void fetchCatalogModels({
      featured: activeMeta.featured ? true : undefined,
      category: activeMeta.category,
      page: 1,
      page_size: HOME_ALT_MODELS_PAGE_SIZE,
      include_unavailable: false,
    })
      .then(({ items }) => {
        if (cancelled) return;
        const next = activeMeta.featured ? items.filter((m) => m.featured) : items;
        setModels(next.slice(0, HOME_ALT_MODELS_PAGE_SIZE));
        hasLoadedRef.current = true;
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMeta.featured, activeMeta.category, reloadNonce]);

  return (
    <section className="home-alt-models">
      <div className="home-section-container home-alt-models__container">
        <header className="home-alt-models__head">
          <h2 className="home-alt-models__title">{t('homeAlt.modelsTitle')}</h2>
          <p className="home-alt-models__subtitle">{t('homeAlt.modelsSubtitle')}</p>
        </header>

        <div className="home-alt-models__layout">
          <article className="home-alt-models__promo">
            {/* 推广视频走 public/videos/，替换同名文件即可换片 */}
            <div className="home-alt-models__promo-visual" aria-hidden="true">
              <video
                className="home-alt-models__promo-video"
                src="/videos/promo-platform.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            </div>
            <div className="home-alt-models__promo-body">
              <h3 className="home-alt-models__promo-title" title={t('homeAlt.promoTitle')}>
                {t('homeAlt.promoTitle')}
              </h3>
              <p className="home-alt-models__promo-desc" title={t('homeAlt.promoDesc')}>
                {t('homeAlt.promoDesc')}
              </p>
              <button type="button" className="home-alt-models__promo-btn" onClick={handlePrimary}>
                {t('home.newsCard1Cta')}
              </button>
            </div>
          </article>

          <div className="home-alt-models__plaza">
            <div className="home-alt-models__toolbar">
              <div className="home-alt-models__tabs" role="tablist">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    data-label={tab.label}
                    aria-selected={tab.id === activeTab}
                    className={`home-alt-models__tab${tab.id === activeTab ? ' is-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <Link to="/models" className="home-alt-models__browse">
                {t('home.newsCard2Cta')} <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="home-alt-models__plaza-body">
              <ul className="home-alt-models__grid">
                {loading && models.length === 0
                  ? Array.from({ length: HOME_ALT_MODELS_PAGE_SIZE }, (_, i) => (
                      <li key={`sk-${i}`}>
                        <div className="home-alt-models__card is-skeleton" />
                      </li>
                    ))
                  : Array.from({ length: HOME_ALT_MODELS_PAGE_SIZE }, (_, i) => {
                      const model = models[i];
                      if (!model) {
                        return <li key={`empty-${i}`} aria-hidden="true" />;
                      }
                      const tags = modelCardTags(model, t);
                      const fullDesc = model.description || model.usage_description || '';
                      const desc = truncateText(fullDesc, 72);
                      const icon = providerIconByKey[model.provider_key];
                      return (
                        <li key={model.id}>
                          <button
                            type="button"
                            className="home-alt-models__card"
                            onClick={() => navigate(`/models?open=${model.id}`)}
                          >
                            <div className="home-alt-models__card-head">
                              {icon ? (
                                <img src={icon} alt="" className="home-alt-models__card-logo" />
                              ) : (
                                <span className="home-alt-models__card-logo is-fallback" aria-hidden>
                                  {(model.provider || model.name).slice(0, 1)}
                                </span>
                              )}
                              <div className="home-alt-models__card-titles">
                                <strong title={model.name}>{model.name}</strong>
                                <span title={model.provider}>{model.provider}</span>
                              </div>
                            </div>
                            <p title={fullDesc}>{desc}</p>
                            {tags.length > 0 ? (
                              <div className="home-alt-models__card-tags">
                                {tags.map((tag) => (
                                  <span key={tag}>{tag}</span>
                                ))}
                              </div>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
              </ul>
              {error ? (
                <div className="home-alt-models__status">
                  <div>
                    <p>{t('modelPlaza.listLoadFailed')}</p>
                    <button type="button" onClick={() => setReloadNonce((n) => n + 1)}>
                      {t('modelPlaza.retry')}
                    </button>
                  </div>
                </div>
              ) : null}
              {!loading && !error && models.length === 0 ? (
                <p className="home-alt-models__status">{t('modelPlaza.noResults')}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
