import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ColumnType } from 'antd/es/table';
import { TableColumnSettings } from '../components/TableColumnSettings';
import type { ManagedColumnType } from '../utils/tableColumnVisibility';
import {
  buildTableColumnDescriptors,
  clearTableColumnVisibility,
  filterVisibleTableColumns,
  injectTableColumnSettingsControl,
  readTableColumnVisibility,
  resolveHiddenColumnIds,
  stripTableColumnFixed,
  writeTableColumnVisibility,
} from '../utils/tableColumnVisibility';

export interface UseTableColumnVisibilityOptions<T extends object> {
  /** Unique id per table instance, e.g. `users-list`, `admin-billing-invoices` */
  tableId: string;
  columns: ManagedColumnType<T>[];
  /** Persist preferences to localStorage; default true */
  persist?: boolean;
}

function sameHiddenIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

export function useTableColumnVisibility<T extends object>({
  tableId,
  columns,
  persist = true,
}: UseTableColumnVisibilityOptions<T>) {
  const descriptors = useMemo(() => buildTableColumnDescriptors(columns), [columns]);

  const defaultHiddenIds = useMemo(
    () => resolveHiddenColumnIds(descriptors, null),
    [descriptors],
  );

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    if (!persist) return defaultHiddenIds;
    const stored = readTableColumnVisibility(tableId);
    return resolveHiddenColumnIds(descriptors, stored);
  });

  useEffect(() => {
    const next = !persist
      ? defaultHiddenIds
      : resolveHiddenColumnIds(descriptors, readTableColumnVisibility(tableId));
    // 列定义每帧变新时 descriptors 会重建；若 hidden 集合等价则禁止 setState，否则表格页会死循环
    setHiddenIds((prev) => (sameHiddenIds(prev, next) ? prev : next));
  }, [tableId, descriptors, defaultHiddenIds, persist]);

  const toggleColumn = useCallback((columnId: string, visible: boolean) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(columnId);
      else next.add(columnId);
      if (persist) writeTableColumnVisibility(tableId, { hiddenIds: [...next] });
      return next;
    });
  }, [persist, tableId]);

  const resetColumns = useCallback(() => {
    if (persist) clearTableColumnVisibility(tableId);
    setHiddenIds(defaultHiddenIds);
  }, [defaultHiddenIds, persist, tableId]);

  const settingsControl = useMemo(
    () => (
      <TableColumnSettings
        descriptors={descriptors}
        hiddenIds={hiddenIds}
        onToggle={toggleColumn}
        onReset={resetColumns}
      />
    ),
    [descriptors, hiddenIds, resetColumns, toggleColumn],
  );

  const visibleColumns = useMemo(() => {
    const filtered = filterVisibleTableColumns(columns, hiddenIds) as ColumnType<T>[];
    // 操作列统一不固定，宽表靠横向滚动查看
    const responsive = stripTableColumnFixed(filtered);
    // 列设置齿轮挂在操作列 / 末列表头；工具栏内的 settingsControl 保留兼容但建议不再渲染
    return injectTableColumnSettingsControl(responsive, settingsControl);
  }, [columns, hiddenIds, settingsControl]);

  return {
    columns: visibleColumns,
    /** @deprecated 列设置已注入表头；返回 null 避免工具栏重复展示 */
    settingsControl: null as ReactNode,
    resetColumns,
    hiddenColumnIds: hiddenIds,
  };
}
