import { ApiOutlined, BarChartOutlined } from '@ant-design/icons';
import { Col, Flex, Row, Typography } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HOME_NEWS_CARD_API_CUBE_IMAGE,
  HOME_NEWS_CARD_RANKING_CUBE_IMAGE,
} from '../constants/homeVisualAssets';
import { HomeSectionHeroTitle } from './shared/HomeSectionHeroTitle';
import { HomeNewsHighlightCard } from './shared/HomeNewsHighlightCard';
import './shared/home-shared.css';
import './home-news-cards-scale.css';
import './home-sections.css';

const { Paragraph } = Typography;

export function HomeNewsSection() {
  const { t, i18n } = useTranslation();

  const cards = useMemo(
    () =>
      [
        {
          key: 'api-models',
          variant: 'api' as const,
          title: t('home.newsCard1Title'),
          description: t('home.newsCard1Desc'),
          ctaLabel: t('home.newsCard1Cta'),
          to: '/models',
          icon: <ApiOutlined />,
          visualSrc: HOME_NEWS_CARD_API_CUBE_IMAGE,
        },
        {
          key: 'model-rankings',
          variant: 'ranking' as const,
          title: t('home.newsCard2Title'),
          description: t('home.newsCard2Desc'),
          ctaLabel: t('home.newsCard2Cta'),
          to: '/pricing',
          icon: <BarChartOutlined />,
          visualSrc: HOME_NEWS_CARD_RANKING_CUBE_IMAGE,
        },
      ] as const,
    [t, i18n.language],
  );

  return (
    <section className="home-section-plate home-news-section">
      <div className="home-section-container">
        <Flex vertical align="center" className="home-news-section__head">
          <HomeSectionHeroTitle
            rest={t('home.recentAnnouncementsRest')}
            accent={t('home.recentAnnouncementsAccent')}
            accentFirst={false}
            spaced
          />
          <Paragraph type="secondary" className="home-news-section__desc home-section-lead-desc">
            {t('home.announcementsDesc')}
          </Paragraph>
        </Flex>
        <Row gutter={0} align="top" className="home-news-cards-row">
          {cards.map((item) => (
            <Col key={item.key} xs={24} lg={12}>
              <HomeNewsHighlightCard
                variant={item.variant}
                title={item.title}
                description={item.description}
                to={item.to}
                ctaLabel={item.ctaLabel}
                icon={item.icon}
                visualSrc={item.visualSrc}
              />
            </Col>
          ))}
        </Row>
      </div>
    </section>
  );
}
