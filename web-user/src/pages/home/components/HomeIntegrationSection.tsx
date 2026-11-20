import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CODE_TABS } from '../constants/codeExamples';

export function HomeIntegrationSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="home-surface-card home-surface-card-soft" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '22px 22px 0' }}>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>{t('home.quickIntegration')}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{t('home.quickIntegrationDesc')}</p>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '16px 22px 0' }}>
        {CODE_TABS.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActiveTab(i)}
            style={{
              background: i === activeTab ? 'var(--bg-elevated)' : 'transparent',
              color: i === activeTab ? 'var(--text-primary)' : 'var(--text-tertiary)',
              border: '1px solid var(--border-default)',
              borderBottom: i === activeTab ? '1px solid var(--bg-elevated)' : '1px solid var(--border-default)',
              borderRadius: '10px 10px 0 0',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              marginRight: -1,
              position: 'relative',
              zIndex: i === activeTab ? 1 : 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <pre
        style={{
          background: 'var(--bg-elevated)',
          borderTop: '1px solid var(--border-default)',
          margin: 0,
          padding: '20px 22px 22px',
          overflowX: 'auto',
          fontSize: 12.5,
          lineHeight: 1.75,
          fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace",
          color: 'var(--text-primary)',
        }}
      >
        {CODE_TABS[activeTab].code}
      </pre>
    </div>
  );
}
