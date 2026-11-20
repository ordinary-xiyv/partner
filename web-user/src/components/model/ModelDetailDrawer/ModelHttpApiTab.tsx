import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CatalogDetailDTO } from '../../../types/catalog';
import { useUserHasApiToken } from '../../../hooks/useUserHasApiToken';
import { ModelDetailCodeWindow } from './ModelDetailCodeWindow';

const DEFAULT_ANTHROPIC_ENDPOINT = '/v1/messages';

export function ModelHttpApiTab({
  detail,
  drawerOpen,
}: {
  detail: CatalogDetailDTO;
  drawerOpen: boolean;
}) {
  const { t } = useTranslation();
  const { needsApiKeyBanner } = useUserHasApiToken(drawerOpen);
  const http = detail.docs?.http_api;

  if (!http?.curl) {
    return <p className="model-detail-empty-tab">{t('modelPlaza.httpEmpty')}</p>;
  }

  const anthropicCurl = http.anthropic_curl ?? '';
  const anthropicEndpoint = http.anthropic_endpoint || DEFAULT_ANTHROPIC_ENDPOINT;

  return (
    <div className="model-detail-tab-content model-detail-http">
      {needsApiKeyBanner ? (
        <div className="model-detail-http__banner">
          {t('modelPlaza.createApiKeyHint')}{' '}
          <Link to="/tokens">{t('modelPlaza.goCreateApiKey')}</Link>
        </div>
      ) : null}
      <ModelDetailCodeWindow
        openai={{ curl: http.curl, endpoint: http.endpoint || '/v1/chat/completions' }}
        anthropic={{
          curl: anthropicCurl || http.curl,
          endpoint: anthropicEndpoint,
        }}
      />
    </div>
  );
}
