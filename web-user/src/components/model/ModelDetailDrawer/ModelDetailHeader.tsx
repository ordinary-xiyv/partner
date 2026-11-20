import { CopyOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { DocsExternalLink } from '../../DocsExternalLink';
import type { CatalogDetailDTO } from '../../../types/catalog';
import { ProviderLogo } from '../ProviderLogo';
import { copyToClipboard } from '../../../utils';
import { notifyApiError, notifyApiSuccess } from '../../../lib/notifyApi';
import { ModelDetailDescription } from './ModelDetailDescription';
import { CATALOG_CATEGORY_OPTIONS, CATALOG_FREE_QUOTA_UNIT_OPTIONS } from '../../../utils/catalog-admin-meta';

export interface ModelDetailHeaderProps {
  detail: CatalogDetailDTO;
  providerIconUri?: string;
  onTryOnline?: (modelName: string) => void;
}

export function ModelDetailHeader({ detail, providerIconUri, onTryOnline }: ModelDetailHeaderProps) {
  const { t } = useTranslation();

  const handleCopyId = async () => {
    const ok = await copyToClipboard(detail.name);
    if (ok) notifyApiSuccess(t('copied'));
    else notifyApiError(t('operationFailed'));
  };

  const quota = detail.free_quota;
  const categoryLabelKey = CATALOG_CATEGORY_OPTIONS.find((o) => o.value === detail.category)?.labelKey;
  const categoryLabel = categoryLabelKey ? t(categoryLabelKey) : detail.category;

  const tagItems = [
    ...(categoryLabel ? [categoryLabel] : []),
    ...detail.tags.filter((tag) => tag !== categoryLabel),
  ];

  const metaParts: string[] = [];
  if (quota) {
    const unitOption = CATALOG_FREE_QUOTA_UNIT_OPTIONS.find((o) => o.value === quota.unit);
    const unitLabel = unitOption?.value ? t(unitOption.labelKey) : '';
    const unitSuffix = unitLabel ? ` ${unitLabel}` : '';

    if (quota.remaining != null) {
      metaParts.push(
        `${t('modelPlaza.freeQuota')} ${t('modelPlaza.freeQuotaRemaining')} ${quota.remaining.toLocaleString()} / ${quota.total.toLocaleString()}${unitSuffix}`,
      );
    } else {
      metaParts.push(
        `${t('modelPlaza.freeQuota')} ${t('modelPlaza.freeQuotaTotal')} ${quota.total.toLocaleString()}${unitSuffix}`,
      );
      // TODO: 剩余额度接入后再展示 · ${t('modelPlaza.loginForRemaining')}
    }
  }
  const metaText = metaParts.join(' · ');

  return (
    <header className="model-detail-header">
      <div className="model-detail-header__top">
        <div className="model-detail-header__identity">
          <ProviderLogo iconDataUri={providerIconUri} size={48} />
          <div className="model-detail-header__title-block">
            <div className="model-detail-header__title-row">
              <h2 className="model-detail-header__title">{detail.name}</h2>
              <button
                type="button"
                className="model-detail-header__copy"
                onClick={() => void handleCopyId()}
                title={t('copyModelId')}
                aria-label={t('copyModelId')}
              >
                <CopyOutlined />
              </button>
            </div>
            {metaText ? (
              <p className="model-detail-header__meta" title={metaText}>
                {metaText}
              </p>
            ) : null}
          </div>
        </div>
        <div className="model-detail-header__actions">
          {/* 先屏蔽 */}
          {/* <Button
            className="model-detail-header__action-btn"
            disabled={!detail.available}
            onClick={() => onTryOnline?.(detail.name)}
          >
            {t('modelPlaza.tryOnline')}
          </Button> */}
          <DocsExternalLink>
            <Button className="model-detail-header__action-btn">{t('modelPlaza.apiDocs')}</Button>
          </DocsExternalLink>
        </div>
      </div>
      <ModelDetailDescription text={detail.description} />
      {tagItems.length > 0 ? (
        <div className="model-detail-header__tags">
          {tagItems.map((tag) => (
            <span key={tag} className="model-detail-header__tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}
