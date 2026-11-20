import { Col, Row } from 'antd';
import { useTranslation } from 'react-i18next';
import { useHomeStatsItems } from '../hooks/useHomeStatsItems';
import type { ModelCatalogStat } from '../types';
import { HomeSectionShell } from './shared/HomeSectionShell';
import { HomeStatMetricCard } from './shared/HomeStatMetricCard';
import './shared/home-shared.css';
import './home-sections.css';

interface HomePlatformStatsSectionProps {
  modelCatalogStat: ModelCatalogStat;
}

export function HomePlatformStatsSection({ modelCatalogStat }: HomePlatformStatsSectionProps) {
  const { t } = useTranslation();
  const stats = useHomeStatsItems(modelCatalogStat);

  return (
    <section className="home-section-plate home-platform-section">
      <div className="home-section-container">
        <div className="home-platform-plate">
          <HomeSectionShell title={t('home.platformTitle')} description={t('home.platformDesc')} titleLevel={2} />
          <Row gutter={[16, 16]}>
            {stats.map((item) => (
              <Col key={item.label} xs={24} sm={24} md={8}>
                <HomeStatMetricCard value={item.value} label={item.label} note={item.note} />
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </section>
  );
}
