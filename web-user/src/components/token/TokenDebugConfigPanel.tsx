import { Typography } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { notifyApiSuccess } from '../../lib/notifyApi';
import { copyToClipboard } from '../../utils';
import type { Token } from '../../types';
import { DOCS_NEW_TAB_ANCHOR_PROPS, getDocsAppHref, getDocsHomeUrl } from '../../config/docs';
import { useStatus } from '../../contexts/StatusContext';
import {
  TOKEN_STATUS_ENABLED,
  maskTokenKey,
  pickPreferredToken,
} from './tokenDisplay';

const { Text } = Typography;

const FALLBACK_SITE_BASE_URL = 'https://tokens.lynxtoncloud.com';

export interface TokenDebugConfigPanelProps {
  tokens: Token[];
  onCopyKey: (tokenId: number) => void;
}

/** 与文档 / 模型广场一致：优先站点维护的 ServerAddress，其次 VITE_API_URL */
function resolveSiteBaseUrl(serverAddress?: string): string {
  const fromStatus = (serverAddress || '').trim();
  if (fromStatus) return fromStatus.replace(/\/+$/, '');

  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }

  return FALLBACK_SITE_BASE_URL;
}

/** 调试身份：只读展示默认 API Key + Base URL */
export function TokenDebugConfigPanel({
  tokens,
  onCopyKey,
}: TokenDebugConfigPanelProps) {
  const { t } = useTranslation();
  const { status } = useStatus();

  const enabledTokens = useMemo(
    () => tokens.filter((item) => item.status === TOKEN_STATUS_ENABLED),
    [tokens],
  );

  const defaultToken = useMemo(
    () => pickPreferredToken(tokens),
    [tokens],
  );
  const copyTargetId = defaultToken?.id;
  const apiBaseUrl = useMemo(
    () => `${resolveSiteBaseUrl(status?.server_address)}/v1`,
    [status?.server_address],
  );
  const docsUrl = getDocsHomeUrl();

  const handleCopyBaseUrl = async () => {
    await copyToClipboard(apiBaseUrl);
    notifyApiSuccess(t('copied'));
  };

  return (
    <section className="tokens-panel tokens-config">
      <div className="tokens-panel-title">
        <div>
          <h2>{t('tokenDebugConfigTitle')}</h2>
          <p>{t('tokenDebugConfigDesc')}</p>
        </div>
      </div>

      <div className="tokens-config-row tokens-config-row--key">
        <div className="tokens-config-default" title={defaultToken ? maskTokenKey(defaultToken.key) : undefined}>
          {defaultToken ? (
            <>
              <span className="tokens-config-default__tag">default</span>
              <span className="tokens-config-default__sep">·</span>
              <span className="tokens-config-default__key">{maskTokenKey(defaultToken.key)}</span>
            </>
          ) : (
            <Text type="secondary">{t('tokenDebugNoDefault')}</Text>
          )}
        </div>
        <button
          type="button"
          className="tokens-copy-btn"
          disabled={!copyTargetId}
          onClick={() => copyTargetId && onCopyKey(copyTargetId)}
        >
          {t('tokenCopyKey')}
        </button>
      </div>

      <div className="tokens-config-row">
        <div className="tokens-config-label">{t('tokenApiBaseUrl')}</div>
        <div className="tokens-config-value" title={apiBaseUrl}>{apiBaseUrl}</div>
        <button type="button" className="tokens-copy-btn" onClick={() => void handleCopyBaseUrl()}>
          {t('copy')}
        </button>
      </div>

      <div className="tokens-config-footer">
        <div>
          <strong>{t('tokenDebugReadyQ')}</strong>
          <a className="tokens-doc-link" href={getDocsAppHref(docsUrl)} {...DOCS_NEW_TAB_ANCHOR_PROPS}>
            {t('tokenDebugHowToCall')}
          </a>
        </div>
      </div>

      {enabledTokens.length === 0 ? (
        <Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 13 }}>
          {t('tokenDebugNoEnabled')}
        </Text>
      ) : null}
    </section>
  );
}
