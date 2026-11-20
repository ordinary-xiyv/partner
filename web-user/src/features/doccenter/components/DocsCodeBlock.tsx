import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DocsCodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

export default function DocsCodeBlock({ className, children }: DocsCodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const language = /language-(\w+)/.exec(className ?? '')?.[1];

  const handleCopy = async () => {
    const text = preRef.current?.textContent?.replace(/\n$/, '') ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="docs-code-block">
      <div className="docs-code-block__toolbar">
        {language && <span className="docs-code-block__lang">{language}</span>}
        <button type="button" className="docs-code-block__copy" onClick={handleCopy}>
          {copied ? t('docCenter.copied') : t('docCenter.copyCode')}
        </button>
      </div>
      <pre ref={preRef} className={className}>
        <code>{children}</code>
      </pre>
    </div>
  );
}
