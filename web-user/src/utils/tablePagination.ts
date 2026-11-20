import type { TablePaginationConfig } from 'antd/es/table/interface';

/** 与 Billing 等需「每页条数」选择器页面共用的可选列表 */
export const DEFAULT_PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'] as const;

/** 列表分页默认每页条数：取可选列表中的最小值，与各页 `useState` 初始值保持一致 */
export const DEFAULT_TABLE_PAGE_SIZE = Number(DEFAULT_PAGE_SIZE_OPTIONS[0]);

/**
 * 服务端分页：完整分页条 + 每页条数可选；默认不展示「1-20 / 100」类前缀（与 Ant Design 默认一致）。
 * 需要合计文案时传入 `showTotal`。
 * `onChange` 第二参数为新的 pageSize（可能 undefined 表示仅翻页）。
 */
export function controlledListPagination(
  params: {
    current: number;
    pageSize: number;
    total: number;
    onChange: (page: number, pageSize?: number) => void;
    /** @deprecated 保留兼容；勿在新代码使用 simple，全站统一完整分页 */
    variant?: 'full' | 'simple';
    showSizeChanger?: boolean;
    pageSizeOptions?: string[];
    showTotal?: TablePaginationConfig['showTotal'];
    hideOnSinglePage?: boolean;
  },
): TablePaginationConfig {
  const {
    current,
    pageSize,
    total,
    onChange,
    variant = 'full',
    showSizeChanger = true,
    pageSizeOptions,
    showTotal,
    hideOnSinglePage,
  } = params;

  if (variant === 'simple') {
    return {
      current,
      pageSize,
      total,
      onChange: (page) => onChange(page),
      showSizeChanger: false,
      simple: true,
      hideOnSinglePage,
    };
  }

  const sizeOpts = pageSizeOptions ?? [...DEFAULT_PAGE_SIZE_OPTIONS];

  return {
    current,
    pageSize,
    total,
    onChange: (page, size) => onChange(page, size),
    showSizeChanger,
    pageSizeOptions: showSizeChanger ? sizeOpts : undefined,
    ...(showTotal !== undefined ? { showTotal } : {}),
    hideOnSinglePage,
  };
}

/**
 * 仅前端分页：与完整分页条一致（含每页条数）；默认不展示 range/total 前缀。
 * 使用 `defaultPageSize` 而非 `pageSize`，避免父组件每次 render 把每页条数固定成初值
 *（否则 antd 视为受控，`showSizeChanger` 改条数后会在下一次 render 被改回 10）。
 */
export function localListPagination(
  params: {
    /** 初始每页条数；分页状态由 Table 内部持有 */
    pageSize?: number;
    showSizeChanger?: boolean;
    pageSizeOptions?: string[];
    showTotal?: TablePaginationConfig['showTotal'];
    hideOnSinglePage?: boolean;
  } = {},
): TablePaginationConfig {
  const {
    pageSize = DEFAULT_TABLE_PAGE_SIZE,
    showSizeChanger = true,
    pageSizeOptions,
    showTotal,
    hideOnSinglePage,
  } = params;
  return {
    defaultPageSize: pageSize,
    showSizeChanger,
    pageSizeOptions: showSizeChanger ? (pageSizeOptions ?? [...DEFAULT_PAGE_SIZE_OPTIONS]) : undefined,
    ...(showTotal !== undefined ? { showTotal } : {}),
    hideOnSinglePage,
  };
}
