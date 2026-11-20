import React, { useMemo, useRef, useState } from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';

export type LogSelectFilterOption = string | { label: string; value: string };

export interface LogModelNameFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: LogSelectFilterOption[];
  /** 自定义选项展示文案（value 不变，如 * → 所有模型） */
  formatOptionLabel?: (value: string) => string;
  loading?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

function fuzzyMatchOption(input: string, label: string): boolean {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

function normalizeOption(
  item: LogSelectFilterOption,
  formatOptionLabel?: (value: string) => string,
): { label: string; value: string; title: string } {
  if (typeof item === 'string') {
    const label = formatOptionLabel ? formatOptionLabel(item) : item;
    return { label, value: item, title: label };
  }
  const label = formatOptionLabel ? formatOptionLabel(item.value) : item.label;
  return { label, value: item.value, title: label };
}

/** 下拉项 / 已选项溢出时，hover 展示全文 */
export function LogSelectOverflowText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [title, setTitle] = useState<string | undefined>();
  return (
    <span
      ref={ref}
      title={title}
      onMouseEnter={() => {
        const el = ref.current;
        setTitle(el && el.scrollWidth > el.clientWidth ? text : undefined);
      }}
      style={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  );
}

export const logSelectOverflowRender = {
  optionRender: (option: { label?: React.ReactNode }) => (
    <LogSelectOverflowText text={String(option.label ?? '')} />
  ),
  labelRender: (item: { label?: React.ReactNode }) => (
    <LogSelectOverflowText text={String(item.label ?? '')} />
  ),
};

/** 日志模块下拉筛选：输入仅模糊过滤下拉项，选中选项后才应用筛选 */
export function LogModelNameFilter({
  value,
  onChange,
  options,
  formatOptionLabel,
  loading = false,
  placeholder,
  'aria-label': ariaLabel,
  style,
  disabled = false,
}: LogModelNameFilterProps) {
  const { t } = useTranslation();

  const selectOptions = useMemo(
    () => options.map((item) => normalizeOption(item, formatOptionLabel)),
    [options, formatOptionLabel],
  );

  return (
    <Select
      showSearch
      allowClear
      disabled={disabled}
      loading={loading}
      placeholder={placeholder ?? t('modelName')}
      aria-label={ariaLabel ?? t('modelName')}
      value={value || undefined}
      options={selectOptions}
      optionFilterProp="label"
      filterOption={(input, option) => fuzzyMatchOption(input, String(option?.label ?? ''))}
      optionRender={logSelectOverflowRender.optionRender}
      labelRender={logSelectOverflowRender.labelRender}
      style={style ?? { minWidth: 160, width: 160 }}
      onChange={(next) => onChange((next as string) ?? '')}
    />
  );
}
