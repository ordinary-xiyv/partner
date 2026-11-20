import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ctaBg from '../../../assets/home-alt/cta-bg.png';
import './home-alt-cta.css';

interface HomeAltCtaSectionProps {
  onPrimaryAction: () => void;
}

export function HomeAltCtaSection({ onPrimaryAction }: HomeAltCtaSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="home-alt-cta">
      <div
        className="home-alt-cta__bg"
        aria-hidden="true"
        style={{ backgroundImage: `url(${ctaBg})` }}
      />
      <div className="home-section-container home-alt-cta__container">
        <div className="home-alt-cta__content">
          <h2 className="home-alt-cta__title" title={t('homeAlt.ctaTitle')}>{t('homeAlt.ctaTitle')}</h2>
          <p className="home-alt-cta__desc" title={t('homeAlt.ctaDesc')}>{t('homeAlt.ctaDesc')}</p>
          <div className="home-alt-cta__actions">
            <button type="button" className="home-alt-cta__btn home-alt-cta__btn--primary" onClick={onPrimaryAction}>
              {t('home.getStartedFree')}
            </button>
            <Link to="/enterprise/apply" className="home-alt-cta__btn home-alt-cta__btn--secondary">
              {t('home.contactSales')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
