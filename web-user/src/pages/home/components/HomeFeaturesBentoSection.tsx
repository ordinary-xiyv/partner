import { Col, Row } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FeatureBillingVisual,
  FeatureModelAccessDecor,
  FeatureModelAccessVisual,
  FeatureRoutingVisual,
} from './feature-bento-visuals';
import { getDocsHomeUrl, resolveDocLang } from '../../../config/docs';
import { HomeNavLinkCard } from './shared/HomeNavLinkCard';
import './shared/home-shared.css';
import './home-sections.css';

export function HomeFeaturesBentoSection() {
  const { t, i18n } = useTranslation();

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
    <section className="home-section-plate home-features-bento-section">
      <div className="home-section-container">
        <Row gutter={[16, 16]} align="stretch">
          <Col xs={24} lg={14}>
            <HomeNavLinkCard
              size="large"
              title={cards.primary.title}
              description={cards.primary.description}
              to={cards.primary.to}
              ctaLabel={cards.primary.ctaLabel}
              visual={<FeatureModelAccessVisual />}
              decorVisual={<FeatureModelAccessDecor />}
            />
          </Col>
          <Col xs={24} lg={10}>
            <div className="home-features-bento__stack">
              <HomeNavLinkCard
                title={cards.routing.title}
                description={cards.routing.description}
                href={cards.routing.href}
                ctaLabel={cards.routing.ctaLabel}
                visual={<FeatureRoutingVisual />}
              />
              <HomeNavLinkCard
                title={cards.billing.title}
                description={cards.billing.description}
                to={cards.billing.to}
                ctaLabel={cards.billing.ctaLabel}
                visual={<FeatureBillingVisual />}
              />
            </div>
          </Col>
        </Row>
      </div>
    </section>
  );
}
