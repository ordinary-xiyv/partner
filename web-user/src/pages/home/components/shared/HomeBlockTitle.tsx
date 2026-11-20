import { AppstoreOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import type { ReactNode } from 'react';

const { Title } = Typography;

export type HomeBlockTitleVariant = 'accent' | 'inverse';

interface HomeBlockTitleProps {
  title: string;
  variant?: HomeBlockTitleVariant;
  icon?: ReactNode;
  level?: 4 | 5;
  className?: string;
}

export function HomeBlockTitle({
  title,
  variant = 'accent',
  icon,
  level = 4,
  className,
}: HomeBlockTitleProps) {
  return (
    <div
      className={['home-block-title', `home-block-title--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="home-block-title__icon" aria-hidden>
        {icon ?? <AppstoreOutlined />}
      </span>
      <Title level={level} className="home-block-title__text">
        {title}
      </Title>
    </div>
  );
}
