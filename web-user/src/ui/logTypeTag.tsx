import React from 'react';
import { Tag } from 'antd';
import type { TagProps } from 'antd';

/** 与 Billing / Logs 对齐的日志类型色（Ant Design Tag `color`） */
const LOG_TYPE_COLOR: Record<number, NonNullable<TagProps['color']>> = {
  1: 'green',
  2: 'blue',
  3: 'cyan',
  4: 'default',
  5: 'red',
  6: 'orange',
  7: 'purple',
  8: 'volcano',
};

function logTypeLabel(type: number, t: (key: string) => string): string {
  switch (type) {
    case 1: return t('logTypeTopup');
    case 2: return t('logTypeConsume');
    case 3: return t('logTypeManage');
    case 4: return t('logTypeSystem');
    case 5: return t('logTypeError');
    case 6: return t('logTypeRefund');
    case 7: return t('logTypePreDeduct');
    case 8: return t('logTypeSupplementaryDeduct');
    default: return t('logTypeSystem');
  }
}

/** 用量/账单日志 type → Ant Tag；文案仅来自 i18n（logTypeTopup / logTypeConsume 等），勿在此写死中文 */
export function logTypeTag(type: number, t: (key: string) => string): React.ReactElement {
  const color = LOG_TYPE_COLOR[type] ?? 'default';
  return <Tag color={color}>{logTypeLabel(type, t)}</Tag>;
}
