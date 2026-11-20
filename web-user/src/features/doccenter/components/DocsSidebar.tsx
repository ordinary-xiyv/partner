import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input, Spin } from 'antd';
import { CaretRightOutlined, SearchOutlined } from '@ant-design/icons';
import type {
  PublicDocsTree,
  PublicDocsTreeNode,
} from '../../../types/doccenter';
import { filterPublicDocsTree, getPublicDocsRootEntries } from '../utils/publicDocsTree';

interface DocsSidebarProps {
  tree: PublicDocsTree | null;
  loading?: boolean;
  activeSlug?: string;
}

function nodeContainsActive(
  node: PublicDocsTreeNode,
  activeSlug?: string,
): boolean {
  if (node.type === 'article') return !!activeSlug && node.data.slug === activeSlug;
  return (node.data.nodes ?? []).some((child) => nodeContainsActive(child, activeSlug));
}

function categoryNodesContainActive(
  nodes: PublicDocsTreeNode[] | undefined,
  activeSlug?: string,
): boolean {
  if (!activeSlug || !nodes) return false;
  return nodes.some((node) => nodeContainsActive(node, activeSlug));
}

function collectDefaultExpandedKeys(
  tree: PublicDocsTree,
  activeSlug?: string,
): string[] {
  const keys: string[] = [];
  tree.categories.forEach((category) => {
    if (categoryNodesContainActive(category.nodes, activeSlug)) {
      keys.push(`root-${category.slug}`);
    }
    collectNestedKeys(category.nodes, activeSlug, keys);
  });
  return keys;
}

function collectNestedKeys(
  nodes: PublicDocsTreeNode[] | undefined,
  activeSlug: string | undefined,
  keys: string[],
) {
  (nodes ?? []).forEach((node) => {
    if (node.type !== 'category') return;
    if (nodeContainsActive(node, activeSlug)) {
      keys.push(`cat-${node.data.id}`);
    }
    collectNestedKeys(node.data.nodes, activeSlug, keys);
  });
}

function rowStyle(depth: number): React.CSSProperties {
  return { '--depth': depth } as React.CSSProperties;
}

interface DocsSidebarNodesProps {
  nodes: PublicDocsTreeNode[];
  activeSlug?: string;
  depth: number;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
}

function DocsSidebarNodes({
  nodes,
  activeSlug,
  depth,
  expandedKeys,
  onToggle,
}: DocsSidebarNodesProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'article') {
          const isActive = activeSlug === node.data.slug;
          return (
            <Link
              key={node.data.slug}
              to={node.data.path}
              className={`docs-sidebar__row docs-sidebar__row--leaf${isActive ? ' is-active' : ''}`}
              style={rowStyle(depth)}
            >
              <span className="docs-sidebar__row-label">{node.data.title}</span>
            </Link>
          );
        }

        const key = `cat-${node.data.id}`;
        const expanded = expandedKeys.has(key);
        const hasChildren = !!(node.data.nodes && node.data.nodes.length > 0);

        return (
          <React.Fragment key={key}>
            <button
              type="button"
              className={`docs-sidebar__row docs-sidebar__row--folder${expanded ? ' is-expanded' : ''}`}
              style={rowStyle(depth)}
              onClick={() => onToggle(key)}
              aria-expanded={expanded}
            >
              <CaretRightOutlined className="docs-sidebar__row-caret" />
              <span className="docs-sidebar__row-label">{node.data.title}</span>
            </button>
            {hasChildren && expanded && (
              <DocsSidebarNodes
                nodes={node.data.nodes!}
                activeSlug={activeSlug}
                depth={depth + 1}
                expandedKeys={expandedKeys}
                onToggle={onToggle}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

export default function DocsSidebar({
  tree,
  loading,
  activeSlug,
}: DocsSidebarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

  const filteredTree = useMemo(() => {
    if (!tree) return null;
    return filterPublicDocsTree(tree, query);
  }, [query, tree]);

  useEffect(() => {
    if (!filteredTree) return;
    const defaults = collectDefaultExpandedKeys(filteredTree, activeSlug);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      defaults.forEach((key) => next.add(key));
      if (query.trim()) {
        filteredTree.categories.forEach((category) => next.add(`root-${category.slug}`));
      }
      return next;
    });
  }, [filteredTree, activeSlug, query]);

  const rootEntries = useMemo(() => {
    if (!filteredTree) return [];
    return getPublicDocsRootEntries(filteredTree);
  }, [filteredTree]);

  const toggleKey = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="docs-sidebar">
      <div className="docs-sidebar__header">
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined />}
          placeholder={t('docCenter.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <nav className="docs-sidebar__nav" aria-label={t('docCenter.sidebarTitle')}>
        {loading ? (
          <div className="docs-sidebar__loading">
            <Spin size="small" />
          </div>
        ) : (
          rootEntries.map((entry) => {
            if (entry.kind === 'article') {
              const isActive = activeSlug === entry.article.slug;
              return (
                <Link
                  key={entry.article.slug}
                  to={entry.article.path}
                  className={`docs-sidebar__row docs-sidebar__row--leaf${isActive ? ' is-active' : ''}`}
                  style={rowStyle(0)}
                >
                  <span className="docs-sidebar__row-label">{entry.article.title}</span>
                </Link>
              );
            }

            const category = entry.category;
            const rootKey = `root-${category.slug}`;
            const expanded = expandedKeys.has(rootKey);
            const nodes = category.nodes ?? [];
            if (nodes.length === 0) return null;

            return (
              <section key={category.slug} className="docs-sidebar__section">
                <button
                  type="button"
                  className={`docs-sidebar__row docs-sidebar__row--section${expanded ? ' is-expanded' : ''}`}
                  style={rowStyle(0)}
                  onClick={() => toggleKey(rootKey)}
                  aria-expanded={expanded}
                >
                  <CaretRightOutlined className="docs-sidebar__row-caret" />
                  <span className="docs-sidebar__row-label">{category.title}</span>
                </button>
                {expanded && nodes.length > 0 && (
                  <div className="docs-sidebar__section-body">
                    <DocsSidebarNodes
                      nodes={nodes}
                      activeSlug={activeSlug}
                      depth={1}
                      expandedKeys={expandedKeys}
                      onToggle={toggleKey}
                    />
                  </div>
                )}
              </section>
            );
          })
        )}
      </nav>
    </div>
  );
}
