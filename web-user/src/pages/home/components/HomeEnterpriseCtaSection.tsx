import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface HomeEnterpriseCtaSectionProps {
  onPrimaryAction: () => void;
}

export function HomeEnterpriseCtaSection({ onPrimaryAction }: HomeEnterpriseCtaSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="home-enterprise-cta home-enterprise-cta-soft">
      <div>
        <div className="home-kicker" style={{ marginBottom: 10 }}>{t('home.enterpriseKicker')}</div>
        <h2 style={{ fontSize: 'clamp(24px, 4vw, 36px)', letterSpacing: '-0.03em', margin: '0 0 10px' }}>{t('home.readyTitle')}</h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0, maxWidth: 620 }}>{t('home.readyDesc')}</p>
      </div>
      <div className="hero-buttons" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onPrimaryAction}
          style={{ background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          {t('home.getStartedFree')}
        </button>
        <Link
          to="/enterprise/apply"
          style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-hover)', borderRadius: 10, padding: '12px 22px', fontSize: 15, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          {t('home.contactSales')}
        </Link>
      </div>
    </div>
  );
}
