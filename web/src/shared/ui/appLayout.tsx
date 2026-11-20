import React from 'react';
import { Empty, Flex, Space, Typography } from 'antd';

const { Title, Text } = Typography;

/** 页面顶栏：标题 24px/800，副标题 13px secondary；仅用 antd 组件，样式随主题 */
export function AppPageHeader({
  title,
  subtitle,
  actions,
  marginBottom = 24,
  actionsAlign = 'flex-start',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  marginBottom?: number;
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
        <Title
          level={2}
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </Title>
        {subtitle ? (
          <Text
            style={{ display: 'block', marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}
          >
            {subtitle}
          </Text>
        ) : null}
      </div>
      {actions ? <Space size="small">{actions}</Space> : null}
    </Flex>
  );
}

/** 空状态 */
export function AppEmpty({ icon = '📭', message }: { icon?: string; message: string }) {
  return (
    <Empty
      image={<span style={{ fontSize: 40, lineHeight: 1 }}>{icon}</span>}
      styles={{ image: { height: 'auto', marginBottom: 8 } }}
      description={
        <Text style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{message}</Text>
      }
    />
  );
}
