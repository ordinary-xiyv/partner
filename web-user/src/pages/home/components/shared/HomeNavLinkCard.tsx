import { ArrowRightOutlined } from '@ant-design/icons';
import { Button, Card, Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { DOCS_NEW_TAB_ANCHOR_PROPS, getDocsAppHref, isDocsAppPath } from '../../../../config/docs';
import './home-shared.css';

const { Title, Paragraph } = Typography;

interface HomeNavLinkCardProps {
  title: string;
  description: string;
  to?: string;
  href?: string;
  ctaLabel: string;
  visual?: ReactNode;
  size?: 'large' | 'compact';
  decorVisual?: ReactNode;
}

export function HomeNavLinkCard({
  title,
  description,
  to,
  href,
  ctaLabel,
  visual,
  size = 'compact',
  decorVisual,
}: HomeNavLinkCardProps) {
  const isLarge = size === 'large';
  const newTabHref = href
    ? (isDocsAppPath(href) ? getDocsAppHref(href) : href)
    : (isDocsAppPath(to) ? getDocsAppHref(to) : undefined);
  const destination = to ?? '/';

  return (
    <Card
      className={['home-nav-link-card', isLarge ? 'home-nav-link-card--large' : ''].filter(Boolean).join(' ')}
      bordered={false}
      styles={{ body: { padding: isLarge ? '22px 22px 18px' : '20px' } }}
    >
      {visual ? (
        <div className={['home-nav-link-card__visual', decorVisual ? 'home-nav-link-card__visual--decor' : ''].filter(Boolean).join(' ')}>
          {visual}
          {decorVisual}
        </div>
      ) : null}
      <Title level={isLarge ? 4 : 5} style={{ margin: '0 0 8px' }}>
        {title}
      </Title>
      <Paragraph type="secondary" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.7 }}>
        {description}
      </Paragraph>
      <div className="home-nav-link-card__footer">
        {newTabHref ? (
          <a href={newTabHref} className="home-inline-link" {...DOCS_NEW_TAB_ANCHOR_PROPS}>
            {ctaLabel} <span>{'\u2197'}</span>
          </a>
        ) : (
          <Link to={destination} className="home-inline-link">
            {ctaLabel} <span>{'\u2197'}</span>
          </Link>
        )}
        {newTabHref ? (
          <a href={newTabHref} aria-label={ctaLabel} {...DOCS_NEW_TAB_ANCHOR_PROPS}>
            <Button type="default" shape="circle" className="home-nav-link-card__arrow" icon={<ArrowRightOutlined />} />
          </a>
        ) : (
          <Link to={destination} aria-label={ctaLabel}>
            <Button type="default" shape="circle" className="home-nav-link-card__arrow" icon={<ArrowRightOutlined />} />
          </Link>
        )}
      </div>
    </Card>
  );
}
