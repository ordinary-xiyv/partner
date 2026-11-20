import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import './home-bottom-cta-scale.css';
import './home-sections.css';

const { Title, Paragraph } = Typography;

interface HomeBottomCtaSectionProps {
  onPrimaryAction: () => void;
}

export function HomeBottomCtaSection({ onPrimaryAction }: HomeBottomCtaSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="home-section-plate home-bottom-cta-section">
      <div className="home-section-container">
        <div className="home-bottom-cta-banner">
          <div className="home-bottom-cta-banner__content">
            <Title level={2} className="home-bottom-cta-banner__title">
              {t('home.readyTitle')}
            </Title>
            <Paragraph className="home-bottom-cta-banner__desc">{t('home.readyDesc')}</Paragraph>
            <div className="home-bottom-cta-actions">
              <button
                type="button"
                className="home-bottom-cta-btn home-bottom-cta-btn--primary"
                onClick={onPrimaryAction}
              >
                {t('home.getStartedFree')}
              </button>
              <Link to="/enterprise/apply" className="home-bottom-cta-btn home-bottom-cta-btn--secondary">
                {t('home.contactSales')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
