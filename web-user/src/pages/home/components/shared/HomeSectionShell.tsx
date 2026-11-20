import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Title, Paragraph } = Typography;

interface HomeSectionShellProps {
  title: string;
  description?: string;
  extra?: ReactNode;
  titleLevel?: 2 | 3 | 4;
  className?: string;
}

export function HomeSectionShell({
  title,
  description,
  extra,
  titleLevel = 2,
  className,
}: HomeSectionShellProps) {
  return (
    <Flex
      className={['home-section-head', className].filter(Boolean).join(' ')}
      align="flex-end"
      justify="space-between"
      gap={16}
      wrap="wrap"
    >
      <div style={{ maxWidth: 640 }}>
        <Title level={titleLevel} style={{ marginBottom: description ? 8 : 0, letterSpacing: '-0.02em' }}>
          {title}
        </Title>
        {description ? (
          <Paragraph type="secondary" style={{ margin: 0, fontSize: 15, lineHeight: 1.75 }}>
            {description}
          </Paragraph>
        ) : null}
      </div>
      {extra}
    </Flex>
  );
}
