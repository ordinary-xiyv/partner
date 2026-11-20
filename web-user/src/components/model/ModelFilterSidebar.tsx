import { CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import type { CatalogFiltersDTO, CatalogListFilters } from '../../types/catalog';
import { DEFAULT_CATALOG_LIST_FILTERS } from '../../types/catalog';
import { PagePanel } from '../../ui/PagePanel';

export interface ModelFilterSidebarProps {
  filtersMeta: CatalogFiltersDTO | null;
  value: CatalogListFilters;
  onChange: (next: CatalogListFilters) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  isMobile?: boolean;
  onClose?: () => void;
  inactive?: boolean;
}

function FilterTagGroup({
  title,
  options,
  activeKey,
  onSelect,
  allLabel,
}: {
  title: string;
  options: { key: string; label: string }[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
  allLabel: string;
}) {
  return (
    <section className="model-plaza-filter__section">
      <h4 className="model-plaza-filter__title">{title}</h4>
      <div className="model-plaza-filter__tags">
        <button
          type="button"
          className={`lynx-selectable lynx-selectable--pill lynx-selectable--pill-fixed${activeKey === null ? ' lynx-selectable--active' : ''}`}
          onClick={() => onSelect(null)}
        >
          {allLabel}
        </button>
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`lynx-selectable lynx-selectable--pill lynx-selectable--pill-fixed${activeKey === opt.key ? ' lynx-selectable--active' : ''}`}
            onClick={() => onSelect(activeKey === opt.key ? null : opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function MultiTagGroup({
  title,
  tags,
  selected,
  onToggle,
}: {
  title: string;
  tags: string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <section className="model-plaza-filter__section">
      <h4 className="model-plaza-filter__title">{title}</h4>
      <div className="model-plaza-filter__tags">
        {tags.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`lynx-selectable lynx-selectable--pill lynx-selectable--pill-fixed${active ? ' lynx-selectable--active' : ''}`}
              onClick={() => onToggle(tag)}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ModelFilterSidebar({
  filtersMeta,
  value,
  onChange,
  loading,
  error,
  onRetry,
  className,
  isMobile,
  onClose,
  inactive,
}: ModelFilterSidebarProps) {
  const { t } = useTranslation();

  const reset = () => onChange({ ...DEFAULT_CATALOG_LIST_FILTERS, search: value.search });

  const toggleTag = (tag: string) => {
    const next = value.tags.includes(tag)
      ? value.tags.filter((x) => x !== tag)
      : [...value.tags, tag];
    onChange({ ...value, tags: next });
  };

  const renderBody = () => {
    if (loading && !filtersMeta) {
      return (
        <div className="model-plaza-filter__loading">
          <Spin />
        </div>
      );
    }
    if (error && !filtersMeta) {
      return (
        <div className="model-plaza-filter__error">
          {onRetry ? (
            <Button size="small" type="primary" onClick={onRetry}>
              {t('modelPlaza.retry')}
            </Button>
          ) : null}
        </div>
      );
    }
    if (!filtersMeta) {
      return <p className="model-plaza-filter__empty">{t('modelPlaza.noFilters')}</p>;
    }
    const categoryOptions = filtersMeta.categories
      .filter((c) => c.key !== 'all')
      .map((c) => ({
        key: c.key,
        label: t(`catalog.category.${c.key}`, { defaultValue: c.label }),
      }));

    return (
      <>
        <FilterTagGroup
          title={t('type')}
          options={categoryOptions}
          activeKey={value.category}
          onSelect={(key) => onChange({ ...value, category: key })}
          allLabel={t('modelPlaza.categoryAll')}
        />
        <FilterTagGroup
          title={t('modelPlaza.filterProvider')}
          options={filtersMeta.providers}
          activeKey={value.provider}
          onSelect={(key) => onChange({ ...value, provider: key })}
          allLabel={t('modelPlaza.allProviders')}
        />
        <FilterTagGroup
          title={t('modelPlaza.filterGroup')}
          options={filtersMeta.groups}
          activeKey={value.group}
          onSelect={(key) => onChange({ ...value, group: key })}
          allLabel={t('modelPlaza.allGroups')}
        />
        <MultiTagGroup
          title={t('modelPlaza.filterCapability')}
          tags={filtersMeta.tags}
          selected={value.tags}
          onToggle={toggleTag}
        />
        <FilterTagGroup
          title={t('modelPlaza.filterBilling')}
          options={filtersMeta.pricing_types}
          activeKey={value.pricingType}
          onSelect={(key) => onChange({ ...value, pricingType: key })}
          allLabel={t('modelPlaza.allBillingTypes')}
        />
      </>
    );
  };

  return (
    <aside
      className={['model-plaza-filter', className].filter(Boolean).join(' ')}
      aria-hidden={inactive || undefined}
      inert={inactive || undefined}
    >
      <PagePanel className="model-plaza-filter-panel">
        <div className="model-plaza-filter__header">
          <span className="model-plaza-filter__heading">{t('modelPlaza.filterTitle')}</span>
          <div className="model-plaza-filter__header-actions">
            <Button icon={<ReloadOutlined />} onClick={reset} disabled={loading}>
              {t('modelPlaza.reset')}
            </Button>
            {isMobile && onClose ? (
              <button
                type="button"
                className="model-plaza-filter__close"
                onClick={onClose}
                aria-label={t('close')}
              >
                <CloseOutlined />
              </button>
            ) : null}
          </div>
        </div>

        <div className="model-plaza-filter__body">{renderBody()}</div>

        {isMobile && onClose ? (
          <div className="model-plaza-filter__footer">
            <Button type="primary" block onClick={onClose}>
              {t('modelPlaza.mobileFilterDone')}
            </Button>
          </div>
        ) : null}
      </PagePanel>
    </aside>
  );
}
