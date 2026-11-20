import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HomeEnterpriseCtaSection } from './HomeEnterpriseCtaSection';
import type { HomeAnnouncementItem } from '../types';

interface HomeAnnouncementsSectionProps {
  onPrimaryAction: () => void;
}

export function HomeAnnouncementsSection({ onPrimaryAction }: HomeAnnouncementsSectionProps) {
  const { t, i18n } = useTranslation();

  const announcements = useMemo<HomeAnnouncementItem[]>(
    () => [
      { title: t('home.announcement1Title'), desc: t('home.announcement1Desc'), date: '2026/03/20', tag: t('home.announcementTagOps') },
      { title: t('home.announcement2Title'), desc: t('home.announcement2Desc'), date: '2026/03/10', tag: t('home.announcementTagEnterprise') },
    ],
    [t, i18n.language],
  );

  return (
    <section className="home-section-plate">
      <div className="landing-section" style={{ maxWidth: 1160, margin: '0 auto', padding: '26px 40px 72px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 24, marginBottom: 8 }}>{t('home.recentAnnouncements')}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{t('home.announcementsDesc')}</p>
          </div>
          <Link to="/announcements" className="home-inline-link">{t('home.viewAll')} <span>{'\u2197'}</span></Link>
        </div>
        <div className="grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {announcements.map((item) => (
            <div key={item.title} className="home-surface-card home-surface-card-soft">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', marginBottom: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
                <span className="home-mini-pill" style={{ whiteSpace: 'nowrap' }}>{item.tag}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{item.desc}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{item.date}</div>
            </div>
          ))}
        </div>
        <HomeEnterpriseCtaSection onPrimaryAction={onPrimaryAction} />
      </div>
    </section>
  );
}
