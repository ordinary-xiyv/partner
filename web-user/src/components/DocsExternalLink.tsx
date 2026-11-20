import type { ReactNode } from 'react';
import { DOCS_NEW_TAB_ANCHOR_PROPS, getDocsAppHref } from '../config/docs';

interface DocsExternalLinkProps {
  children: ReactNode;
  className?: string;
}

export function DocsExternalLink({ children, className }: DocsExternalLinkProps) {
  return (
    <a
      href={getDocsAppHref()}
      className={className}
      {...DOCS_NEW_TAB_ANCHOR_PROPS}
    >
      {children}
    </a>
  );
}
