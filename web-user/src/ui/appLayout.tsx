import React from 'react';
import { Empty, Flex, Space, Typography } from 'antd';

const { Title, Text } = Typography;

/** 页面顶栏：仅 Ant Design 组件，样式随 ConfigProvider 主题 */
export function AppPageHeader({
  title,
  subtitle,
  actions,
  marginBottom = 28,
  actionsAlign = 'flex-start',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** 与下方内容区间距，默认 28 */
  marginBottom?: number;
  /** 右侧操作区垂直对齐，令牌页等可与副标题底对齐 */
  actionsAlign?: 'flex-start' | 'flex-end' | 'center';
}) {
  return (
    <Flex
      justify="space-between"
      align={actionsAlign}
      wrap="wrap"
      gap={12}
      style={{ marginBottom }}
    >
      <div>
        <Title level={2} style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          {title}
        </Title>
        {subtitle ? (
          <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
            {subtitle}
          </Text>
        ) : null}
      </div>
      {actions ? <Space size="small">{actions}</Space> : null}
    </Flex>
  );
}

/** 空状态：Ant Design Empty + 可选 emoji 图标 */
export function AppEmpty({ icon = '📭', message }: { icon?: string; message: string }) {
  return (
    <Empty
      image={<span style={{ fontSize: 40, lineHeight: 1 }}>{icon}</span>}
      imageStyle={{ height: 'auto', marginBottom: 8 }}
      description={
        <Text type="secondary" style={{ fontSize: 14 }}>
          {message}
        </Text>
      }
    />
  );
}
