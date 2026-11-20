import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Drawer, Grid, Spin, Tabs, theme } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCatalogModelDetail } from '../../../hooks/useCatalogModelDetail';
import { ModelDetailHeader } from './ModelDetailHeader';
import { ModelSpecsTab } from './ModelSpecsTab';
import { ModelHttpApiTab } from './ModelHttpApiTab';
import { ModelIntegrationTab } from './ModelIntegrationTab';
import {
  hasHttpApiTabContent,
  hasIntegrationTabContent,
  hasSpecsTabContent,
} from './modelDetailTabVisibility';
import './model-detail-drawer.css';

/** 抵消 rc-drawer Portal 对 body 的 width: calc(100% - 滚动条)（本页滚动在 .layout-main） */
const SCROLL_FIX_CLASS = 'model-detail-drawer-scroll-fix';
const SCROLL_FIX_RELEASE_MS = 150;

function releaseDrawerScrollFix() {
  window.setTimeout(() => {
    document.documentElement.classList.remove(SCROLL_FIX_CLASS);
  }, SCROLL_FIX_RELEASE_MS);
}

export interface ModelDetailDrawerProps {
  open: boolean;
  catalogId?: number;
  providerIconUri?: string;
  providerIconByKey?: Record<string, string>;
  onClose: () => void;
  onTryOnline?: (modelName: string) => void;
  onLoadFailed?: () => void;
}

export function ModelDetailDrawer({
  open,
  catalogId,
  providerIconUri,
  providerIconByKey,
  onClose,
  onTryOnline,
  onLoadFailed,
}: ModelDetailDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const width = isMobile ? '100%' : 680;
  const [activeTab, setActiveTab] = useState('specs');

  useEffect(() => {
    if (open) {
      document.documentElement.classList.add(SCROLL_FIX_CLASS);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove(SCROLL_FIX_CLASS);
    };
  }, []);

  const effectiveCatalogId = open ? catalogId : undefined;

  const { detail, loading, reload } = useCatalogModelDetail(effectiveCatalogId, open);

  const resolvedProviderIcon =
    providerIconUri ??
    (detail?.provider_key && providerIconByKey
      ? providerIconByKey[detail.provider_key]
      : undefined);

  const handleTryOnline = (modelName: string) => {
    if (onTryOnline) {
      onTryOnline(modelName);
      return;
    }
    navigate(`/chat?model=${encodeURIComponent(modelName)}`);
    onClose();
  };

  const tabItems = useMemo(() => {
    if (!detail) return [];
    const items: Array<{ key: string; label: string; children: ReactNode }> = [];

    if (hasSpecsTabContent(detail)) {
      items.push({
        key: 'specs',
        label: t('modelPlaza.tabSpecs'),
        children: <ModelSpecsTab key={detail.id} detail={detail} />,
      });
    }

    if (hasHttpApiTabContent(detail)) {
      items.push({
        key: 'http',
        label: t('modelPlaza.tabHttp'),
        children: <ModelHttpApiTab detail={detail} drawerOpen={open} />,
      });
    }

    if (hasIntegrationTabContent(detail.docs?.claude_code)) {
      items.push({
        key: 'claude',
        label: t('modelPlaza.tabClaude'),
        children: <ModelIntegrationTab data={detail.docs?.claude_code} tabKey="claude" />,
      });
    }

    if (hasIntegrationTabContent(detail.docs?.opencode)) {
      items.push({
        key: 'opencode',
        label: t('modelPlaza.tabOpenCode'),
        children: <ModelIntegrationTab data={detail.docs?.opencode} tabKey="opencode" />,
      });
    }

    if (hasIntegrationTabContent(detail.docs?.openclaw)) {
      items.push({
        key: 'openclaw',
        label: t('modelPlaza.tabOpenClaw'),
        children: <ModelIntegrationTab data={detail.docs?.openclaw} tabKey="openclaw" />,
      });
    }

    return items;
  }, [detail, open, t]);

  useEffect(() => {
    if (!open || tabItems.length === 0) return;
    setActiveTab((prev) => (tabItems.some((item) => item.key === prev) ? prev : tabItems[0].key));
  }, [open, catalogId, tabItems]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Drawer
      rootClassName="model-detail-drawer"
      title={null}
      placement="right"
      open={open}
      onClose={handleClose}
      closable={{ placement: 'end' }}
      push={false}
      width={width}
      destroyOnClose
      afterOpenChange={(visible) => {
        if (!visible) releaseDrawerScrollFix();
      }}
      styles={{
        header: {
          marginBottom: 0,
          padding: `${token.paddingSM}px ${token.paddingLG}px`,
          borderBottom: 'none',
        },
        body: { padding: 0 },
      }}
    >
      {loading && !detail ? (
        <div className="model-detail-drawer__loading">
          <Spin size="large" />
        </div>
      ) : detail ? (
        <div className="model-detail-drawer__body">
          <ModelDetailHeader
            detail={detail}
            providerIconUri={resolvedProviderIcon}
            onTryOnline={handleTryOnline}
          />
          {tabItems.length > 0 ? (
            <div className="model-detail-tabs">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                destroyInactiveTabPane={false}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="model-detail-drawer__error">
          <div className="model-detail-drawer__error-actions">
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => void reload()}>
              {t('modelPlaza.retry')}
            </Button>
            <Button
              onClick={() => {
                onLoadFailed?.();
                handleClose();
              }}
            >
              {t('close')}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
