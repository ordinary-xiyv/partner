import { useTranslation } from 'react-i18next';
import { ModelDetailCodeWindow } from './ModelDetailCodeWindow';

function isEmptyDoc(data: Record<string, unknown> | undefined): boolean {
  if (!data) return true;
  return Object.keys(data).length === 0;
}

export function ModelIntegrationTab({
  data,
  tabKey,
}: {
  data: Record<string, unknown> | undefined;
  tabKey: 'claude' | 'opencode' | 'openclaw';
}) {
  const { t } = useTranslation();

  if (isEmptyDoc(data)) {
    return (
      <p className="model-detail-empty-tab">
        {t(`modelPlaza.integrationEmpty.${tabKey}`)}
      </p>
    );
  }

  const doc = data;
  const code =
    typeof doc.code === 'string'
      ? doc.code
      : typeof doc.snippet === 'string'
        ? doc.snippet
        : JSON.stringify(doc, null, 2);

  const openaiEndpoint =
    typeof doc.endpoint === 'string' ? doc.endpoint : '/v1/chat/completions';
  const anthropicCurl = typeof doc.anthropic_curl === 'string' ? doc.anthropic_curl : '';
  const anthropicEndpoint =
    typeof doc.anthropic_endpoint === 'string' ? doc.anthropic_endpoint : '/v1/messages';

  return (
    <div className="model-detail-tab-content">
      <ModelDetailCodeWindow
        openai={{ curl: code, endpoint: openaiEndpoint }}
        anthropic={{
          curl: anthropicCurl || code,
          endpoint: anthropicEndpoint,
        }}
        showProtocolToggle={Boolean(anthropicCurl)}
      />
    </div>
  );
}
