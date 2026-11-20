import { Col, Flex, Row, Typography } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomeStatsItems } from '../hooks/useHomeStatsItems';
import type { ModelCatalogStat } from '../types';
import { HomeSectionHeroTitle } from './shared/HomeSectionHeroTitle';
import { HomeBlockTitle } from './shared/HomeBlockTitle';
import { HomeBlockCubeIcon } from './shared/HomeBlockCubeIcon';
import { HomeCapabilityPanel } from './shared/HomeCapabilityPanel';
import { HomeSchedulingSubCard } from './shared/HomeSchedulingSubCard';
import { HomeModelAccessGradientCard } from './shared/HomeModelAccessGradientCard';
import { HomeStatMetricCard } from './shared/HomeStatMetricCard';
import { getDocsHomeUrl, resolveDocLang } from '../../../config/docs';
import { HOME_PLATFORM_SCROLL_ANCHOR_ID, HOME_PLATFORM_SECTION_ID } from '../constants/homeSectionIds';
import './shared/home-shared.css';
import './home-sections.css';
import './home-platform-plates-scale.css';
import './home-platform-core.css';
import './home-platform-bento-type.css';
import './home-platform-scheduling-type.css';

const { Paragraph } = Typography;

interface HomePlatformCapabilitiesSectionProps {
  modelCatalogStat: ModelCatalogStat;
}

export function HomePlatformCapabilitiesSection({ modelCatalogStat }: HomePlatformCapabilitiesSectionProps) {
  const { t, i18n } = useTranslation();
  const stats = useHomeStatsItems(modelCatalogStat);

  const cards = useMemo(
    () => ({
      primary: {
        title: t('home.feature1Title'),
        description: t('home.feature1Desc'),
        ctaLabel: t('home.feature1Cta'),
        to: '/models',
      },
      routing: {
        title: t('home.feature2Title'),
        description: t('home.feature2Desc'),
        ctaLabel: t('home.feature2Cta'),
        href: getDocsHomeUrl(resolveDocLang(i18n.language)),
      },
      billing: {
        title: t('home.feature3Title'),
        description: t('home.feature3Desc'),
        ctaLabel: t('home.feature3Cta'),
        to: '/pricing',
      },
    }),
    [t, i18n.language],
  );

  return (
    <section id={HOME_PLATFORM_SECTION_ID} className="home-section-plate home-platform-unified">
      <div className="home-section-container">
        <Flex
          id={HOME_PLATFORM_SCROLL_ANCHOR_ID}
          vertical
          align="center"
          className="home-platform-unified__hero-head home-platform-scroll-anchor"
        >
          <HomeSectionHeroTitle
            accent={t('home.platformTitleAccent')}
            rest={t('home.platformTitleSuffix')}
            spaced
          />
          <Paragraph type="secondary" className="home-platform-unified__desc home-section-lead-desc">
            {t('home.platformDesc')}
          </Paragraph>
        </Flex>

        <div className="home-platform-plate home-platform-plate--core">
          <HomeBlockTitle
            title={t('home.platformCoreTitle')}
            variant="accent"
            level={5}
            className="home-block-title--surface-gradient"
            icon={<HomeBlockCubeIcon block="core" />}
          />
          <div className="home-platform-plate--core__stats">
            {stats.map((item) => (
              <HomeStatMetricCard key={item.label} value={item.value} label={item.label} note={item.note} accentValue />
            ))}
          </div>
        </div>

        <Row gutter={[20, 20]} align="stretch" className="home-platform-bento-row">
          <Col xs={24} lg={8}>
            <HomeModelAccessGradientCard
              blockTitle={t('home.modelAccessBlockTitle')}
              title={cards.primary.title}
              description={cards.primary.description}
              to={cards.primary.to}
              ctaLabel={cards.primary.ctaLabel}
            />
          </Col>
          <Col xs={24} lg={16}>
            <HomeCapabilityPanel title={t('home.schedulingTitle')} bodyClassName="home-capability-panel__body--stack">
              <div className="home-scheduling-stack">
                <HomeSchedulingSubCard
                  title={cards.routing.title}
                  description={cards.routing.description}
                  href={cards.routing.href}
                  ariaLabel={cards.routing.ctaLabel}
                />
                <HomeSchedulingSubCard
                  title={cards.billing.title}
                  description={cards.billing.description}
                  to={cards.billing.to}
                  ariaLabel={cards.billing.ctaLabel}
                />
              </div>
            </HomeCapabilityPanel>
          </Col>
        </Row>
      </div>
    </section>
  );
}
