import type { CSSProperties } from 'react';
import { Card, Flex, Skeleton, theme } from 'antd';
import './ModelCard/model-card.css';

export function ModelCardSkeleton() {
  const { token } = theme.useToken();

  return (
    <div
      className="model-plaza-card-wrap model-plaza-card-wrap--skeleton"
      style={{ '--model-plaza-card-radius': `${token.borderRadiusLG}px` } as CSSProperties}
    >
      <Card
        className="model-plaza-card model-plaza-card--skeleton"
        variant="outlined"
        style={{ width: '100%', borderRadius: token.borderRadiusLG }}
        styles={{ body: { padding: 0, height: '100%' } }}
      >
        <div className="model-plaza-card__layout model-plaza-card__layout--has-tags">
          <Flex align="flex-start" gap={10}>
            <Skeleton.Avatar active size={40} shape="square" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton active title={{ width: '65%' }} paragraph={{ rows: 1, width: '40%' }} />
            </div>
          </Flex>
          <Skeleton active paragraph={{ rows: 2 }} title={false} className="model-plaza-card__desc" />
          <div className="model-plaza-card__tags-footer">
            <Flex gap={6}>
              <Skeleton.Button active size="small" style={{ width: 48, minWidth: 48, height: 22 }} />
              <Skeleton.Button active size="small" style={{ width: 56, minWidth: 56, height: 22 }} />
            </Flex>
          </div>
        </div>
      </Card>
    </div>
  );
}
