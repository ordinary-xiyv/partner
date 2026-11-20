import { useTranslation } from 'react-i18next';
import manageApiIcon from '../../../assets/home-alt/manage-api.svg';
import manageChartIcon from '../../../assets/home-alt/manage-chart.svg';
import manageOrgIcon from '../../../assets/home-alt/manage-org.svg';
import manageAuditIcon from '../../../assets/home-alt/manage-audit.svg';
import './home-alt-manage.css';

const HOME_ALT_MANAGE_CARDS = [
  { titleKey: 'homeAlt.manageCard1Title', descKey: 'homeAlt.manageCard1Desc', iconSrc: manageApiIcon },
  { titleKey: 'homeAlt.manageCard2Title', descKey: 'homeAlt.manageCard2Desc', iconSrc: manageChartIcon },
  { titleKey: 'homeAlt.manageCard3Title', descKey: 'homeAlt.manageCard3Desc', iconSrc: manageOrgIcon },
  { titleKey: 'homeAlt.manageCard4Title', descKey: 'homeAlt.manageCard4Desc', iconSrc: manageAuditIcon },
] as const;

export function HomeAltManageSection() {
  const { t } = useTranslation();

  return (
    <section className="home-alt-manage">
      <div className="home-section-container home-alt-manage__container">
        <header className="home-alt-manage__head">
          <h2 className="home-alt-manage__title">{t('homeAlt.manageTitle')}</h2>
          <p className="home-alt-manage__subtitle">{t('homeAlt.manageSubtitle')}</p>
        </header>
        <ul className="home-alt-manage__grid">
          {HOME_ALT_MANAGE_CARDS.map((card) => {
            const title = t(card.titleKey);
            const desc = t(card.descKey);
            return (
            <li key={card.titleKey} className="home-alt-manage__card">
              <img className="home-alt-manage__icon" src={card.iconSrc} alt="" aria-hidden="true" />
              <h3 className="home-alt-manage__card-title" title={title}>{title}</h3>
              <p className="home-alt-manage__card-desc" title={desc}>{desc}</p>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
