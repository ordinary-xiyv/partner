import type { MouseEvent, ReactNode } from 'react';
import { createElement } from 'react';
import type { ColumnType, ColumnTitleProps } from 'antd/es/table/interface';

const STORAGE_PREFIX = 'lynx-table-cols:v1:';

export type ManagedColumnType<T extends object> = ColumnType<T> & {
  /** Popover label when `title` is not a plain string */
  columnLabel?: string;
  /** Always visible; excluded from column settings (e.g. actions) */
  columnSettingsLocked?: boolean;
  /** Hidden by default until user enables */
  defaultHidden?: boolean;
};

export interface TableColumnDescriptor {
  id: string;
  label: string;
  locked: boolean;
  defaultHidden: boolean;
}

export interface TableColumnVisibilityState {
  hiddenIds: string[];
}

function isPlainString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Stable column id for persistence; prefers `key`, then `dataIndex`. */
export function getTableColumnId<T extends object>(column: ColumnType<T>): string {
  const key = column.key;
  if (isPlainString(key) && key.length > 0) return key;
  if (Array.isArray(key) && key.length > 0) return key.map(String).join('.');

  const dataIndex = column.dataIndex;
  if (isPlainString(dataIndex) && dataIndex.length > 0) return dataIndex;
  if (Array.isArray(dataIndex) && dataIndex.length > 0) return dataIndex.map(String).join('.');

  throw new Error('Table column must have a string `key` or `dataIndex` for column visibility.');
}

export function getTableColumnLabel<T extends object>(column: ManagedColumnType<T>): string {
  const managed = column as ManagedColumnType<T>;
  if (managed.columnLabel?.trim()) return managed.columnLabel.trim();
  if (isPlainString(column.title) && column.title.trim()) return column.title.trim();
  return getTableColumnId(column);
}

export function buildTableColumnDescriptors<T extends object>(
  columns: ManagedColumnType<T>[],
): TableColumnDescriptor[] {
  return columns.map((column) => ({
    id: getTableColumnId(column),
    label: getTableColumnLabel(column),
    locked: Boolean(column.columnSettingsLocked),
    defaultHidden: Boolean(column.defaultHidden),
  }));
}

export function readTableColumnVisibility(tableId: string): TableColumnVisibilityState | null {
  if (!tableId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tableId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TableColumnVisibilityState;
    if (!parsed || !Array.isArray(parsed.hiddenIds)) return null;
    return { hiddenIds: parsed.hiddenIds.filter((id) => typeof id === 'string') };
  } catch {
    return null;
  }
}

export function writeTableColumnVisibility(tableId: string, state: TableColumnVisibilityState): void {
  if (!tableId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tableId}`, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function clearTableColumnVisibility(tableId: string): void {
  if (!tableId) return;
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${tableId}`);
  } catch {
    /* ignore */
  }
}

export function resolveHiddenColumnIds(
  descriptors: TableColumnDescriptor[],
  stored: TableColumnVisibilityState | null,
): Set<string> {
  const toggleable = descriptors.filter((d) => !d.locked);
  const toggleableIds = new Set(toggleable.map((d) => d.id));

  if (stored) {
    const hidden = stored.hiddenIds.filter((id) => toggleableIds.has(id));
    const visibleCount = toggleable.length - hidden.length;
    if (visibleCount > 0) return new Set(hidden);
  }

  return new Set(toggleable.filter((d) => d.defaultHidden).map((d) => d.id));
}

export function filterVisibleTableColumns<T extends object>(
  columns: ManagedColumnType<T>[],
  hiddenIds: Set<string>,
): ColumnType<T>[] {
  return columns.filter((column) => {
    if (column.columnSettingsLocked) return true;
    const id = getTableColumnId(column);
    return !hiddenIds.has(id);
  });
}

/** 取消列 fixed，操作列随表格横向滚动 */
export function stripTableColumnFixed<T extends object>(columns: ColumnType<T>[]): ColumnType<T>[] {
  return columns.map((column) => {
    if (column.fixed == null) return column;
    const next = { ...column };
    delete next.fixed;
    return next;
  });
}

function resolveColumnTitleNode<T extends object>(
  title: ColumnType<T>['title'],
  props: ColumnTitleProps<T>,
): ReactNode {
  if (typeof title === 'function') return title(props);
  return title ?? null;
}

/**
 * 将列设置齿轮挂到操作列（优先）或最后一列表头右侧。
 */
export function injectTableColumnSettingsControl<T extends object>(
  columns: ColumnType<T>[],
  settingsControl: ReactNode,
): ColumnType<T>[] {
  if (!settingsControl || columns.length === 0) return columns;

  let targetIdx = columns.findIndex((column) => {
    const key = column.key;
    if (key === 'actions') return true;
    return Boolean((column as ManagedColumnType<T>).columnSettingsLocked);
  });
  if (targetIdx < 0) targetIdx = columns.length - 1;

  return columns.map((column, index) => {
    if (index !== targetIdx) return column;
    const originalTitle = column.title;
    return {
      ...column,
      title: (props: ColumnTitleProps<T>) =>
        createElement(
          'div',
          {
            className: 'lynx-table-col-settings-title',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              width: '100%',
            },
          },
          createElement('span', { className: 'lynx-table-col-settings-title__label' }, resolveColumnTitleNode(originalTitle, props)),
          createElement('span', { className: 'lynx-table-col-settings-title__control', onClick: (e: MouseEvent) => e.stopPropagation() }, settingsControl),
        ),
    };
  });
}

export function canHideTableColumn(
  descriptors: TableColumnDescriptor[],
  hiddenIds: Set<string>,
  columnId: string,
): boolean {
  const descriptor = descriptors.find((d) => d.id === columnId);
  if (!descriptor || descriptor.locked) return false;
  if (!hiddenIds.has(columnId)) {
    const visibleToggleable = descriptors.filter((d) => !d.locked && !hiddenIds.has(d.id)).length;
    return visibleToggleable > 1;
  }
  return true;
}
