import { ArrowRightOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const { Title, Paragraph } = Typography;

interface HomeFeatureSubCardProps {
  title: string;
  description: string;
  to: string;
  ctaLabel: string;
  visual?: ReactNode;
}

export function HomeFeatureSubCard({ title, description, to, ctaLabel, visual }: HomeFeatureSubCardProps) {
  return (
    <article className="home-feature-sub-card">
      {visual ? <div className="home-feature-sub-card__visual">{visual}</div> : null}
      <Title level={5} className="home-feature-sub-card__title">
        {title}
      </Title>
      <Paragraph className="home-feature-sub-card__desc">{description}</Paragraph>
      <div className="home-feature-sub-card__footer">
        <Link to={to} className="home-inline-link">
          {ctaLabel} <span>{'\u2197'}</span>
        </Link>
        <Link to={to} aria-label={ctaLabel}>
          <Button
            type="default"
            shape="circle"
            className="home-feature-sub-card__arrow"
            icon={<ArrowRightOutlined />}
          />
        </Link>
      </div>
    </article>
  );
}
