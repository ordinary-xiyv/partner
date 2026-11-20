import type { ButtonProps } from 'antd';

/**
 * 表格操作列文字按钮：主题色 link，无 icon、无描边。
 * 删除 / 禁用等危险操作另加 `danger`。
 */
export const tableRowLinkBtnProps: Pick<ButtonProps, 'size' | 'type'> = {
  size: 'small',
  type: 'link',
};

/**
 * 表格行内 / 工具条次要操作：`type="default"` 在 Ant Design 5 中映射为 `variant="outlined"`，
 * 带边框，`hover`/`active` 使用主题 `colorPrimary`（见 antd Button `defaultHoverBorderColor` 等）。
 * 操作列请用 `TableRowActions` / `tableRowLinkBtnProps`，勿再用于操作列。
 */
export const borderedRowBtnProps: Pick<ButtonProps, 'size' | 'type'> = {
  size: 'small',
  type: 'default',
};

/** 行内强调（如结算）：主色描边 + 同色 hover/active */
export const borderedRowPrimaryOutlinedProps: Pick<ButtonProps, 'size' | 'color' | 'variant'> = {
  size: 'small',
  color: 'primary',
  variant: 'outlined',
};

/**
 * 弹窗底部成对按钮（取消/保存等）：必须与其它 `middle` 按钮同高，且容器建议 `align-items: center`。
 */
export const modalFooterBtnSecondary: Pick<ButtonProps, 'size' | 'type'> = {
  size: 'middle',
  type: 'default',
};

export const modalFooterBtnPrimary: Pick<ButtonProps, 'size' | 'type'> = {
  size: 'middle',
  type: 'primary',
};
