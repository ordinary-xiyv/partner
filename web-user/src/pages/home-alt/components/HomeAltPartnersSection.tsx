import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HOME_PARTNER_MARQUEE_ROWS,
  resolveHomePartnerLogoSrc,
  type HomePartnerLogoItem,
  type HomePartnerMarqueeRow,
} from '../../home/constants/partnerMarquee';
import './home-alt-partners.css';

interface HomeAltPartnerTrackProps {
  row: HomePartnerMarqueeRow;
  resolveLabel: (item: HomePartnerLogoItem) => string;
}

function HomeAltPartnerTrack({ row, resolveLabel }: HomeAltPartnerTrackProps) {
  const visibleCount = row.items.length;
  const loopItems = useMemo(() => [...row.items, ...row.items], [row.items]);
  const rowStyle = {
    ['--marquee-visible-count' as string]: String(visibleCount),
  } as CSSProperties;
  const directionClass =
    row.direction === 'ltr' ? 'home-alt-partners__track--ltr' : 'home-alt-partners__track--rtl';

  return (
    <div className="home-alt-partners__row" style={rowStyle}>
      <div className="home-alt-partners__viewport">
        <div className={`home-alt-partners__track ${directionClass}`}>
          {loopItems.map((item, index) => {
            const logoSrc = resolveHomePartnerLogoSrc(item.logoFile);
            const label = resolveLabel(item);
            return (
              <div key={`${row.id}-${item.id}-${index}`} className="home-alt-partners__item">
                {logoSrc ? (
                  <img src={logoSrc} alt="" className="home-alt-partners__logo" loading="lazy" decoding="async" />
                ) : (
                  <span className="home-alt-partners__logo home-alt-partners__logo--fallback" aria-hidden />
                )}
                <span className="home-alt-partners__name" title={label}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HomeAltPartnersSection() {
  const { t } = useTranslation();
  const resolveLabel = (item: HomePartnerLogoItem) =>
    item.nameKey ? t(item.nameKey, { defaultValue: item.name }) : item.name;

  return (
    <section className="home-alt-partners" aria-label={t('home.partnerMarqueeAria')}>
      <div className="home-section-container home-alt-partners__container">
        <header className="home-alt-partners__head">
          <h2 className="home-alt-partners__title">{t('home.partnerMarqueeTitle')}</h2>
          <p className="home-alt-partners__subtitle">{t('home.partnerMarqueeDesc')}</p>
        </header>
        <div className="home-alt-partners__rows">
          {HOME_PARTNER_MARQUEE_ROWS.map((row) => (
            <HomeAltPartnerTrack key={row.id} row={row} resolveLabel={resolveLabel} />
          ))}
        </div>
      </div>
    </section>
  );
}
