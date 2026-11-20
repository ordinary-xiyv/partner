import React, { useMemo } from 'react';
import { Button, Checkbox, Flex, Popover, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { TableColumnDescriptor } from '../utils/tableColumnVisibility';
import { canHideTableColumn } from '../utils/tableColumnVisibility';

export interface TableColumnSettingsProps {
  descriptors: TableColumnDescriptor[];
  hiddenIds: Set<string>;
  onToggle: (columnId: string, visible: boolean) => void;
  onReset: () => void;
}

export function TableColumnSettings({
  descriptors,
  hiddenIds,
  onToggle,
  onReset,
}: TableColumnSettingsProps) {
  const { t } = useTranslation();

  const toggleable = useMemo(
    () => descriptors.filter((d) => !d.locked),
    [descriptors],
  );

  if (toggleable.length === 0) return null;

  const content = (
    <div style={{ width: 220, maxHeight: 360, overflow: 'auto' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
        <Typography.Text strong style={{ fontSize: 13 }}>
          {t('tableColumnSettings.title')}
        </Typography.Text>
        <Button type="link" size="small" onClick={onReset} style={{ padding: 0, height: 'auto' }}>
          {t('reset')}
        </Button>
      </Flex>
      <Checkbox.Group
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        value={toggleable.filter((d) => !hiddenIds.has(d.id)).map((d) => d.id)}
      >
        {toggleable.map((descriptor) => {
          const checked = !hiddenIds.has(descriptor.id);
          const disableUncheck = checked && !canHideTableColumn(descriptors, hiddenIds, descriptor.id);
          return (
            <Checkbox
              key={descriptor.id}
              value={descriptor.id}
              disabled={disableUncheck}
              onChange={(e) => onToggle(descriptor.id, e.target.checked)}
            >
              <Typography.Text ellipsis={{ tooltip: descriptor.label }} style={{ maxWidth: 168 }}>
                {descriptor.label}
              </Typography.Text>
            </Checkbox>
          );
        })}
      </Checkbox.Group>
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={content}
      arrow={false}
    >
      <Button
        type="text"
        size="small"
        icon={<SettingOutlined />}
        aria-label={t('tableColumnSettings.button')}
        className="lynx-table-column-settings-trigger"
      />
    </Popover>
  );
}
