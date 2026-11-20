import React from 'react';
import { Alert } from 'antd';
import { USE_MOCK } from '../api/http';

/** 演示模式下在页面顶部给出提示，避免误以为是真实数据 */
export function UseMockNotice() {
  if (!USE_MOCK) return null;
  return (
    <Alert
      type="warning"
      showIcon
      style={{ fontSize: 12 }}
      message="当前为演示数据模式"
      description="页面数据来自本地示例数据，未连接后端。联调时把 .env 中 VITE_USE_MOCK 改为 false。"
    />
  );
}
