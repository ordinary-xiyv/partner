import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spin } from 'antd';
import { docCenterService } from '../features/doccenter/doccenterService';
import { resolveDocLang } from '../features/doccenter/utils/resolveDocLang';
import { findApiReferenceEntryPath } from '../features/doccenter/utils/publicDocsTree';
import { getDocsHomeUrl } from '../config/docs';

/**
 * /docs/api 旧书签兼容：按当前公开文档树动态找目标，不写死任何 slug。
 * 优先「API 参考」分类的第一篇已发布文章，没有则退回文档树第一篇，
 * 都没有则回到文档首页（首页自身有空态处理）。
 */
export default function DocsApiRedirect() {
  const { i18n } = useTranslation();
  const lang = resolveDocLang(i18n.language);
  const [target, setTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    docCenterService
      .getPublicTree(lang)
      .then((tree) => {
        if (!cancelled) setTarget(findApiReferenceEntryPath(tree));
      })
      .catch(() => {
        if (!cancelled) setTarget(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return <Navigate to={target ?? getDocsHomeUrl()} replace />;
}
