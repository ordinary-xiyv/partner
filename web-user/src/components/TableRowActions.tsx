import React, { useMemo } from 'react';
import { Button, Dropdown, Popconfirm, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { tableRowLinkBtnProps } from '../ui/tableRowActionButtons';

export interface TableRowActionItem {
  key: string;
  label: React.ReactNode;
  onClick?: () => void;
  /** Only delete should use danger (red). Disable stays theme purple. */
  danger?: boolean;
  disabled?: boolean;
  /** When set, wraps the action in Popconfirm */
  confirmTitle?: React.ReactNode;
  onConfirm?: () => void;
}

export interface TableRowActionsProps {
  items: Array<TableRowActionItem | false | null | undefined>;
  /** Max visible text buttons before collapsing into「更多」; default 2 */
  maxVisible?: number;
}

function isDeleteAction(item: TableRowActionItem): boolean {
  if (item.key === 'delete') return true;
  if (typeof item.label === 'string') {
    const label = item.label.trim().toLowerCase();
    return label === 'delete' || label === '删除';
  }
  return false;
}

/** 删除永远排在最后；同组内保持原相对顺序 */
function orderActionItems(items: TableRowActionItem[]): TableRowActionItem[] {
  const rest: TableRowActionItem[] = [];
  const deletes: TableRowActionItem[] = [];
  for (const item of items) {
    if (isDeleteAction(item)) deletes.push(item);
    else rest.push(item);
  }
  return [...rest, ...deletes];
}

function ActionLinkButton({
  item,
  block,
}: {
  item: TableRowActionItem;
  block?: boolean;
}): React.ReactElement {
  const btn = (
    <Button
      {...tableRowLinkBtnProps}
      danger={item.danger}
      disabled={item.disabled}
      onClick={item.confirmTitle ? undefined : item.onClick}
      style={block ? { width: '100%', justifyContent: 'flex-start', paddingInline: 12 } : undefined}
    >
      {item.label}
    </Button>
  );

  if (!item.confirmTitle) return btn;

  return (
    <Popconfirm
      title={item.confirmTitle}
      disabled={item.disabled}
      onConfirm={() => {
        item.onConfirm?.();
      }}
    >
      {btn}
    </Popconfirm>
  );
}

/**
 * 表格操作列：纯文字 link 按钮（主题紫）；超过 maxVisible 时收进「更多」。
 * 删除固定末位且用 `danger` 红字；禁用等其它操作保持紫色。
 */
export function TableRowActions({ items, maxVisible = 2 }: TableRowActionsProps) {
  const { t } = useTranslation();

  const visibleItems = useMemo(
    () => orderActionItems(items.filter((item): item is TableRowActionItem => Boolean(item))),
    [items],
  );

  if (visibleItems.length === 0) return null;

  const primary = visibleItems.slice(0, maxVisible);
  const overflow = visibleItems.slice(maxVisible);

  return (
    <Space size={0} wrap align="center" className="lynx-table-row-actions">
      {primary.map((item) => (
        <ActionLinkButton key={item.key} item={item} />
      ))}
      {overflow.length > 0 && (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          dropdownRender={() => (
            <div
              className="ant-dropdown-menu lynx-table-row-actions-menu"
              style={{ padding: '4px 0', minWidth: 96 }}
              onClick={(e) => e.stopPropagation()}
            >
              {overflow.map((item) => (
                <div key={item.key} className="ant-dropdown-menu-item" style={{ padding: 0 }}>
                  <ActionLinkButton item={item} block />
                </div>
              ))}
            </div>
          )}
        >
          <Button {...tableRowLinkBtnProps}>{t('chat.more')}</Button>
        </Dropdown>
      )}
    </Space>
  );
}
