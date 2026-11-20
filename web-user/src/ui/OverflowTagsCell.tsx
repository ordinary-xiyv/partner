import type { ReactNode } from 'react';
import { Space, Tooltip, Typography } from 'antd';

export interface OverflowTagsCellProps {
  items: string[];
  /** 单元格内最多展示的 Tag 数量，默认 2 */
  maxVisible?: number;
  renderTag: (item: string) => ReactNode;
}

const DEFAULT_MAX_VISIBLE = 2;

/**
 * 表格内 Tag 列表：最多展示 N 个，超出显示「...」；悬停 Tooltip 查看全部。
 * 仅使用 antd 原生组件（Space / Tooltip / Typography）。
 */
export function OverflowTagsCell({
  items,
  maxVisible = DEFAULT_MAX_VISIBLE,
  renderTag,
}: OverflowTagsCellProps) {
  if (items.length === 0) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  const visible = items.slice(0, maxVisible);
  const hasMore = items.length > maxVisible;
  const tooltipTitle = items.join('、');

  return (
    <Tooltip title={tooltipTitle}>
      <Typography.Text ellipsis={{ tooltip: false }}>
        <Space size="small" wrap={false}>
          {visible.map((item) => (
            <span key={item}>{renderTag(item)}</span>
          ))}
          {hasMore && <Typography.Text type="secondary">...</Typography.Text>}
        </Space>
      </Typography.Text>
    </Tooltip>
  );
}
