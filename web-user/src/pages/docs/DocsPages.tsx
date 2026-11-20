import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Empty, Spin } from 'antd';
import DocsShell from '../../features/doccenter/components/DocsShell';
import DocsMarkdown from '../../features/doccenter/components/DocsMarkdown';
import DocsToc from '../../features/doccenter/components/DocsToc';
import { docCenterService } from '../../features/doccenter/doccenterService';
import { resolveDocLang } from '../../features/doccenter/utils/resolveDocLang';
import type { PublicDocArticle, PublicDocsTree } from '../../types/doccenter';
import { findFirstArticlePath } from '../../features/doccenter/utils/publicDocsTree';
import { stripLeadingMarkdownH1 } from '../../features/doccenter/utils/stripLeadingMarkdownH1';
import '../../features/doccenter/components/docs-shell.css';

export default function DocsHomePage() {
  const { t, i18n } = useTranslation();
  const lang = resolveDocLang(i18n.language);
  const [tree, setTree] = useState<PublicDocsTree | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docCenterService.getPublicTree(lang).then((data) => {
      if (!cancelled) {
        setTree(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const firstPath = useMemo(() => findFirstArticlePath(tree), [tree]);
  if (!loading && firstPath) {
    return <Navigate to={firstPath} replace />;
  }

  return (
    <DocsShell tree={tree} loading={loading}>
      <div className="docs-page">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Empty description={t('docCenter.emptyTree')} />
        )}
      </div>
    </DocsShell>
  );
}

export function DocsArticlePage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const lang = resolveDocLang(i18n.language);
  const [tree, setTree] = useState<PublicDocsTree | null>(null);
  const [article, setArticle] = useState<PublicDocArticle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      docCenterService.getPublicTree(lang),
      docCenterService.getPublicArticle(slug, lang),
    ]).then(([treeData, articleData]) => {
      if (cancelled) return;
      setTree(treeData);
      setArticle(articleData);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [lang, slug]);

  return (
    <DocsShell tree={tree} loading={loading} activeSlug={slug}>
      {loading ? (
        <div className="docs-page" style={{ padding: '80px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        </div>
      ) : !article ? (
        <div className="docs-page">
          <Empty description={t('docCenter.articleNotFound')} />
        </div>
      ) : (
          <div className="docs-article-layout">
            <div className="docs-page">
              <header className="docs-page__header">
                <div className="docs-page__kicker">{article.category_title}</div>
                <h1 className="docs-page__title">{article.title}</h1>
              </header>
              <DocsMarkdown content={stripLeadingMarkdownH1(article.content)} />
              {(article.prev || article.next) && (
                <div className="docs-page__footer-nav">
                  {article.prev ? (
                    <Link to={article.prev.path} className="docs-page__nav-link">
                      <span>{t('docCenter.prevArticle')}</span>
                      <strong>{article.prev.title}</strong>
                    </Link>
                  ) : (
                    <span />
                  )}
                  {article.next ? (
                    <Link to={`${article.next.path}`} className="docs-page__nav-link docs-page__nav-link--next">
                      <span>{t('docCenter.nextArticle')}</span>
                      <strong>{article.next.title}</strong>
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
            <DocsToc content={stripLeadingMarkdownH1(article.content)} />
          </div>
        )}
    </DocsShell>
  );
}
