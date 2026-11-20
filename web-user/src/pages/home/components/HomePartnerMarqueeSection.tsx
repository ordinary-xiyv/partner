import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HOME_PARTNER_MARQUEE_ROWS,
  resolveHomePartnerLogoSrc,
  type HomePartnerLogoItem,
  type HomePartnerMarqueeRow,
} from '../constants/partnerMarquee';
import { HomeSectionHeroTitle } from './shared/HomeSectionHeroTitle';
import './shared/home-shared.css';

interface HomePartnerMarqueeTrackProps {
  row: HomePartnerMarqueeRow;
  resolveLabel: (item: HomePartnerLogoItem) => string;
}

function HomePartnerMarqueeTrack({ row, resolveLabel }: HomePartnerMarqueeTrackProps) {
  const visibleCount = row.items.length;
  const loopItems = useMemo(() => [...row.items, ...row.items], [row.items]);

  const rowStyle = {
    ['--marquee-visible-count' as string]: String(visibleCount),
  } as CSSProperties;

  const directionClass =
    row.direction === 'ltr' ? 'home-partner-marquee-track--ltr' : 'home-partner-marquee-track--rtl';

  return (
    <div className="home-partner-marquee-row" style={rowStyle}>
      <div className="home-partner-marquee-viewport">
        <div className={`home-partner-marquee-track ${directionClass}`}>
          {loopItems.map((item, index) => {
            const logoSrc = resolveHomePartnerLogoSrc(item.logoFile);
            const label = resolveLabel(item);
            const key = `${row.id}-${item.id}-${index}`;

            return (
              <div key={key} className="home-partner-marquee-item">
                {logoSrc ? (
                  <img src={logoSrc} alt="" className="home-partner-marquee-logo" loading="lazy" decoding="async" />
                ) : (
                  <span className="home-partner-marquee-logo home-partner-marquee-logo--fallback" aria-hidden />
                )}
                <span className="home-partner-marquee-name">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HomePartnerMarqueeSection() {
  const { t } = useTranslation();

  const resolveLabel = (item: HomePartnerLogoItem) =>
    item.nameKey ? t(item.nameKey, { defaultValue: item.name }) : item.name;

  return (
    <section className="home-section-plate home-partner-marquee-section" aria-label={t('home.partnerMarqueeAria')}>
      <div
        className="landing-section home-partner-marquee-shell home-section-container"
      >
        <div className="home-partner-marquee-head">
          <HomeSectionHeroTitle
            rest={t('home.partnerMarqueeTitleRest')}
            accent={t('home.partnerMarqueeTitleAccent')}
            accentFirst={false}
            spaced
          />
          <p className="home-partner-marquee-desc home-section-lead-desc">{t('home.partnerMarqueeDesc')}</p>
        </div>
        <div className="home-partner-marquee-rows">
          {HOME_PARTNER_MARQUEE_ROWS.map((row) => (
            <HomePartnerMarqueeTrack key={row.id} row={row} resolveLabel={resolveLabel} />
          ))}
        </div>
      </div>
    </section>
  );
}
