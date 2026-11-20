import { ArrowRightOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const { Title, Paragraph } = Typography;

export type HomeNewsHighlightCardVariant = 'api' | 'ranking';

interface HomeNewsHighlightCardProps {
  title: string;
  description: string;
  to: string;
  ctaLabel: string;
  icon: ReactNode;
  visualSrc: string;
  variant?: HomeNewsHighlightCardVariant;
  /** 模型广场未上线时隐藏跳转 */
  hideCta?: boolean;
}

export function HomeNewsHighlightCard({
  title,
  description,
  to,
  ctaLabel,
  icon,
  visualSrc,
  variant = 'api',
  hideCta = false,
}: HomeNewsHighlightCardProps) {
  return (
    <article
      className={[
        'home-news-highlight-card',
        variant === 'ranking' ? 'home-news-highlight-card--ranking' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="home-news-highlight-card__body">
        <div className="home-news-highlight-card__title-row">
          <span className="home-news-highlight-card__title-icon" aria-hidden>
            {icon}
          </span>
          <Title level={5} className="home-news-highlight-card__title">
            {title}
          </Title>
        </div>
        <Paragraph className="home-news-highlight-card__desc">{description}</Paragraph>
        {!hideCta ? (
          <Link to={to} className="home-news-highlight-card__cta" aria-label={ctaLabel}>
            <span className="home-news-highlight-card__cta-text">{ctaLabel}</span>
            <span className="home-news-highlight-card__cta-arrow" aria-hidden>
              <ArrowRightOutlined />
            </span>
          </Link>
        ) : null}
      </div>
      <div className="home-news-highlight-card__visual" aria-hidden>
        <img
          className="home-news-highlight-card__visual-img"
          src={visualSrc}
          alt=""
          decoding="async"
          draggable={false}
        />
      </div>
    </article>
  );
}
