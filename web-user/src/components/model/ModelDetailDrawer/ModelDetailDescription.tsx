import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const COLLAPSED_MAX_LINES = 2;

export function ModelDetailDescription({ text }: { text: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;

    const checkOverflow = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22;
      setOverflows(el.scrollHeight > lineHeight * COLLAPSED_MAX_LINES + 1);
    };

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  if (!text.trim()) return null;

  const isClamped = !expanded && overflows;

  return (
    <div className="model-detail-header__desc-wrap">
      <div
        className={
          isClamped
            ? 'model-detail-header__desc-box model-detail-header__desc-box--clamped'
            : 'model-detail-header__desc-box'
        }
      >
        <p
          ref={ref}
          className={
            isClamped
              ? 'model-detail-header__desc model-detail-header__desc--clamped'
              : 'model-detail-header__desc'
          }
        >
          {text}
        </p>
        {isClamped ? (
          <span className="model-detail-header__desc-more">
            <span className="model-detail-header__desc-ellipsis" aria-hidden="true">
              ...
            </span>
            <button
              type="button"
              className="model-detail-header__desc-toggle model-detail-header__desc-toggle--inline"
              onClick={() => setExpanded(true)}
            >
              {t('modelPlaza.expand')}
            </button>
          </span>
        ) : null}
      </div>
      {expanded && overflows ? (
        <button
          type="button"
          className="model-detail-header__desc-toggle"
          onClick={() => setExpanded(false)}
        >
          {t('modelPlaza.collapse')}
        </button>
      ) : null}
    </div>
  );
}
