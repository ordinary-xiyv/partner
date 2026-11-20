import type { ReactNode } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { useTranslation } from 'react-i18next';

export type PlazaViewTab = 'featured' | 'all';

export interface ModelCategoryTabsProps {
  search: string;
  onSearchChange: (value: string) => void;
  activeTab?: PlazaViewTab;
  onTabChange?: (tab: PlazaViewTab) => void;
  showSearch?: boolean;
  afterTabs?: ReactNode;
}

export function ModelCategoryTabs({
  search,
  onSearchChange,
  activeTab = 'all',
  onTabChange,
  showSearch = true,
  afterTabs,
}: ModelCategoryTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="model-plaza-tabs">
      {onTabChange ? (
        <div className="model-plaza-tabs__switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'featured'}
            className={`model-plaza-tabs__tab${activeTab === 'featured' ? ' is-active' : ''}`}
            onClick={() => onTabChange('featured')}
          >
            {t('homeAlt.tabFeatured')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`model-plaza-tabs__tab${activeTab === 'all' ? ' is-active' : ''}`}
            onClick={() => onTabChange('all')}
          >
            {t('pricingFeatureAllModels')}
          </button>
        </div>
      ) : null}
      {afterTabs}
      {showSearch ? (
        <Input
          className="model-plaza-tabs__search"
          prefix={<SearchOutlined />}
          placeholder={t('modelPlaza.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          allowClear
        />
      ) : null}
    </div>
  );
}
