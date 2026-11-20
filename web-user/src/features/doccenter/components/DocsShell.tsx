import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from '../../../components/Header';
import DocsSidebar from './DocsSidebar';
import SidebarAccountDock from '../../../layouts/SidebarAccountDock';
import { AppSidebarProvider, useAppSidebar } from '../../../contexts/AppSidebarContext';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import type { PublicDocsTree } from '../../../types/doccenter';
import '../../../layouts/layout-sidebar.css';
import '../../../layouts/console-scale.css';
import './docs-shell.css';

interface DocsShellProps {
  tree: PublicDocsTree | null;
  loading?: boolean;
  activeSlug?: string;
  children: React.ReactNode;
}

export default function DocsShell(props: DocsShellProps) {
  return (
    <AppSidebarProvider>
      <DocsShellInner {...props} />
    </AppSidebarProvider>
  );
}

function DocsShellInner({
  tree,
  loading,
  activeSlug,
  children,
}: DocsShellProps) {
  const location = useLocation();
  const { isOpen: sidebarOpen, closeSidebar } = useAppSidebar()!;
  const { isDesktop } = useBreakpoint();

  React.useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  React.useEffect(() => {
    if (isDesktop) closeSidebar();
  }, [isDesktop, closeSidebar]);

  React.useEffect(() => {
    if (!sidebarOpen) return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    if (!mq.matches) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [sidebarOpen]);

  return (
    <div className="docs-shell layout-shell">
      <Header layoutMode="console" />
      <div className={`sidebar-overlay ${sidebarOpen ? '' : 'hidden'}`} onClick={closeSidebar} />
      <div className="docs-shell__body">
        <aside className={`layout-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="layout-sidebar-nav">
            <DocsSidebar
              tree={tree}
              loading={loading}
              activeSlug={activeSlug}
            />
          </div>
          <SidebarAccountDock showUser={false} />
        </aside>
        <main className="docs-shell__main">{children}</main>
      </div>
    </div>
  );
}
