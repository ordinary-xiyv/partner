import { useMemo, useState } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import { useTranslation } from 'react-i18next';
import { getDocsAppHref, getDocsHomeUrl, resolveDocLang } from '../../../config/docs';
import { copyToClipboard } from '../../../utils';
import { notifyApiError, notifyApiSuccess } from '../../../lib/notifyApi';

hljs.registerLanguage('bash', bash);

export type ApiProtocolVariant = 'openai' | 'anthropic';

export interface ModelDetailCodeWindowProps {
  openai: { curl: string; endpoint: string };
  anthropic: { curl: string; endpoint: string };
  showProtocolToggle?: boolean;
  docsHref?: string;
}

export function ModelDetailCodeWindow({
  openai,
  anthropic,
  showProtocolToggle = true,
  docsHref,
}: ModelDetailCodeWindowProps) {
  const { t, i18n } = useTranslation();
  const resolvedDocsHref = getDocsAppHref(docsHref ?? getDocsHomeUrl(resolveDocLang(i18n.language)));
  const [protocol, setProtocol] = useState<ApiProtocolVariant>('openai');
  const [copied, setCopied] = useState(false);

  const active =
    protocol === 'anthropic' && anthropic.curl
      ? anthropic
      : openai;

  const highlighted = useMemo(() => {
    try {
      return hljs.highlight(active.curl, { language: 'bash' }).value;
    } catch {
      return active.curl.replace(/</g, '&lt;');
    }
  }, [active.curl]);

  const footerLabel =
    protocol === 'anthropic'
      ? t('modelPlaza.protocolAnthropicCompatible', { endpoint: active.endpoint })
      : t('modelPlaza.protocolOpenaiCompatible', { endpoint: active.endpoint });

  const handleCopy = async () => {
    const ok = await copyToClipboard(active.curl);
    if (ok) {
      notifyApiSuccess(t('copied'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      notifyApiError(t('operationFailed'));
    }
  };

  return (
    <div className="model-detail-code-window">
      <div className="model-detail-code-window__chrome">
        <div className="model-detail-code-window__titlebar">
          <div className="model-detail-code-window__dots" aria-hidden>
            <span className="model-detail-code-window__dot model-detail-code-window__dot--red" />
            <span className="model-detail-code-window__dot model-detail-code-window__dot--yellow" />
            <span className="model-detail-code-window__dot model-detail-code-window__dot--green" />
          </div>
          {showProtocolToggle ? (
            <div className="model-detail-code-window__protocol" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={protocol === 'openai'}
                className={
                  protocol === 'openai'
                    ? 'model-detail-code-window__protocol-btn is-active'
                    : 'model-detail-code-window__protocol-btn'
                }
                onClick={() => setProtocol('openai')}
              >
                OpenAI
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={protocol === 'anthropic'}
                className={
                  protocol === 'anthropic'
                    ? 'model-detail-code-window__protocol-btn is-active'
                    : 'model-detail-code-window__protocol-btn'
                }
                onClick={() => setProtocol('anthropic')}
              >
                Anthropic
              </button>
            </div>
          ) : null}
          <span className="model-detail-code-window__title">{t('modelPlaza.apiAccessTitle')}</span>
          <button
            type="button"
            className="model-detail-code-window__copy"
            onClick={() => void handleCopy()}
            title={copied ? t('codeCopied') : t('copyCode')}
            aria-label={copied ? t('codeCopied') : t('copyCode')}
          >
            <CopyOutlined />
          </button>
        </div>
        <pre className="model-detail-code-window__pre">
          <code className="hljs language-bash" dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
        <div className="model-detail-code-window__footer">
          <span>{footerLabel}</span>
          <a
            href={resolvedDocsHref}
            className="model-detail-code-window__docs-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('modelPlaza.viewDocs')} →
          </a>
        </div>
      </div>
    </div>
  );
}
