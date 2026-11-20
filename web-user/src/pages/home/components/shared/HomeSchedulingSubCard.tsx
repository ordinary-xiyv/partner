import { ArrowRightOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { Link } from 'react-router-dom';
import { DOCS_NEW_TAB_ANCHOR_PROPS, getDocsAppHref, isDocsAppPath } from '../../../../config/docs';

const { Title, Paragraph } = Typography;

interface HomeSchedulingSubCardProps {
  title: string;
  description: string;
  to?: string;
  href?: string;
  ariaLabel: string;
}

/** 稳定调度内叠白卡：仅标题、描述、右下角圆形箭头（对齐设计稿） */
export function HomeSchedulingSubCard({ title, description, to, href, ariaLabel }: HomeSchedulingSubCardProps) {
  const newTabHref = href
    ? (isDocsAppPath(href) ? getDocsAppHref(href) : href)
    : (isDocsAppPath(to) ? getDocsAppHref(to) : undefined);
  const destination = to ?? '/';

  if (newTabHref) {
    return (
      <a
        href={newTabHref}
        {...DOCS_NEW_TAB_ANCHOR_PROPS}
        className="home-scheduling-sub-card"
        aria-label={ariaLabel}
      >
        <Title level={5} className="home-scheduling-sub-card__title">
          {title}
        </Title>
        <Paragraph className="home-scheduling-sub-card__desc">{description}</Paragraph>
        <span className="home-scheduling-sub-card__arrow" aria-hidden>
          <ArrowRightOutlined />
        </span>
      </a>
    );
  }

  return (
    <Link to={destination} className="home-scheduling-sub-card" aria-label={ariaLabel}>
      <Title level={5} className="home-scheduling-sub-card__title">
        {title}
      </Title>
      <Paragraph className="home-scheduling-sub-card__desc">{description}</Paragraph>
      <span className="home-scheduling-sub-card__arrow" aria-hidden>
        <ArrowRightOutlined />
      </span>
    </Link>
  );
}
