import { Typography } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { notifyApiSuccess } from '../../lib/notifyApi';
import { copyToClipboard } from '../../utils';
import type { Token } from '../../types';
import { DOCS_NEW_TAB_ANCHOR_PROPS, getDocsAppHref, getDocsHomeUrl } from '../../config/docs';
import { usePartnerSiteBrand } from '../../hooks/usePartnerSiteBrand';
import {
  TOKEN_STATUS_ENABLED,
  maskTokenKey,
  pickPreferredToken,
} from './tokenDisplay';

const { Text } = Typography;

export interface TokenDebugConfigPanelProps {
  tokens: Token[];
  onCopyKey: (tokenId: number) => void;
}

/**
 * 决定「调试身份」里 Base URL 显示什么。
 *
 * 优先级与首页代码示例保持一致（见 home-style/shared/sdkSnippets.ts）：
 * 伙伴配的 api_base_url > VITE_API_URL > 当前域名。
 *
 * 这里原来是「主站 server_address 优先 + 硬编码 tokens.lynxtoncloud.com 兜底」，
 * 和首页那处是同一个毛病：分销商的客户在调试面板里复制 Base URL，
 * 复制到的是主站地址。两处必须一起改，否则只改首页会变成两套地址。
 *
 * 最后返回空串而不是编一个域名：调用方会拼成 `/v1`，空串时至少看起来
 * 是个没配全的状态，比指向别人的服务器安全。
 */
function resolveDebugBaseUrl(partnerApiBaseUrl?: string): string {
  const fromPartner = (partnerApiBaseUrl || '').trim();
  if (fromPartner) return fromPartner.replace(/\/+$/, '');

  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return '';
}

/** 调试身份：只读展示默认 API Key + Base URL */
export function TokenDebugConfigPanel({
  tokens,
  onCopyKey,
}: TokenDebugConfigPanelProps) {
  const { t } = useTranslation();
  const { brand } = usePartnerSiteBrand();

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
    () => `${resolveDebugBaseUrl(brand?.api_base_url)}/v1`,
    [brand?.api_base_url],
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
