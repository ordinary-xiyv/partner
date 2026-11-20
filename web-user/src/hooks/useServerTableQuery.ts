import { useCallback, useMemo, useState } from 'react';
import type { TablePaginationConfig } from 'antd/es/table/interface';
import { controlledListPagination, DEFAULT_TABLE_PAGE_SIZE } from '../utils/tablePagination';

/** 服务端分页列表：统一管理 current / pageSize / total 与 Ant Table pagination 配置 */
export function useServerTableQuery(initialPageSize = DEFAULT_TABLE_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [total, setTotal] = useState(0);

  const handlePaginationChange = useCallback((p: number, nextSize?: number) => {
    if (nextSize != null && nextSize !== pageSize) {
      setPageSize(nextSize);
      setPage(1);
    } else {
      setPage(p);
    }
  }, [pageSize]);

  const controlledPagination: TablePaginationConfig = useMemo(
    () => controlledListPagination({
      current: page,
      pageSize,
      total,
      onChange: handlePaginationChange,
    }),
    [page, pageSize, total, handlePaginationChange],
  );

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    setTotal,
    controlledPagination,
  };
}
