import React, { useEffect, useMemo, useState } from 'react';
import { VerticalAlignTopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { extractMarkdownHeadings } from '../utils/slugifyHeading';

export const DOCS_MAIN_SCROLL_SELECTOR = '.docs-shell__main';

interface DocsTocProps {
  content: string;
}

function getDocsScrollRoot(): HTMLElement | null {
  return document.querySelector(DOCS_MAIN_SCROLL_SELECTOR);
}

export default function DocsToc({ content }: DocsTocProps) {
  const { t } = useTranslation();
  const headings = useMemo(() => extractMarkdownHeadings(content), [content]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (headings.length === 0) return undefined;

    const elements = headings
      .map((item) => document.getElementById(item.id))
      .filter((item): item is HTMLElement => !!item);

    if (elements.length === 0) return undefined;

    const scrollRoot = getDocsScrollRoot();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        root: scrollRoot,
        rootMargin: '-24px 0px -70% 0px',
        threshold: [0, 1],
      },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [headings]);

  const scrollToTop = () => {
    getDocsScrollRoot()?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToHeading = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const target = document.getElementById(id);
    const root = getDocsScrollRoot();
    if (!target || !root) return;
    const offset = target.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 24;
    root.scrollTo({ top: offset, behavior: 'smooth' });
    window.history.replaceState(null, '', `#${id}`);
    setActiveId(id);
  };

  if (headings.length === 0) return null;

  return (
    <aside className="docs-toc" aria-label={t('docCenter.tocTitle')}>
      <div className="docs-toc__inner">
        <div className="docs-toc__title">{t('docCenter.tocTitle')}</div>
        <ul className="docs-toc__list">
          {headings.map((heading) => (
            <li
              key={heading.id}
              className={`docs-toc__item docs-toc__item--h${heading.level}${activeId === heading.id ? ' docs-toc__item--active' : ''}`}
            >
              <a
                href={`#${heading.id}`}
                className="docs-toc__link"
                onClick={(event) => scrollToHeading(event, heading.id)}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
        <button type="button" className="docs-toc__back-top" onClick={scrollToTop}>
          <VerticalAlignTopOutlined aria-hidden />
          <span>{t('docCenter.backToTop')}</span>
        </button>
      </div>
    </aside>
  );
}
