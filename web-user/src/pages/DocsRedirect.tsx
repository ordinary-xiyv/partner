import { Navigate } from 'react-router-dom';
import { getDocsHomeUrl } from '../config/docs';

/** /docs 旧书签兼容：统一进入站内文档中心 */
export default function DocsRedirect() {
  return <Navigate to={getDocsHomeUrl()} replace />;
}
