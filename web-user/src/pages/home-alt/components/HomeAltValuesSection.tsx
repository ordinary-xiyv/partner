import { useTranslation } from 'react-i18next';
import valueSupport from '../../../assets/home-alt/value-support.svg';
import valueStability from '../../../assets/home-alt/value-stability.svg';
import valueMonitor from '../../../assets/home-alt/value-monitor.svg';
import valueData from '../../../assets/home-alt/value-data.svg';
import './home-alt-values.css';

const HOME_ALT_VALUES = [
  { titleKey: 'homeAlt.valuesItem1Title', descKey: 'homeAlt.valuesItem1Desc', iconSrc: valueSupport },
  { titleKey: 'homeAlt.valuesItem2Title', descKey: 'homeAlt.valuesItem2Desc', iconSrc: valueStability },
  { titleKey: 'homeAlt.valuesItem3Title', descKey: 'homeAlt.valuesItem3Desc', iconSrc: valueMonitor },
  { titleKey: 'homeAlt.valuesItem4Title', descKey: 'homeAlt.valuesItem4Desc', iconSrc: valueData },
] as const;

export function HomeAltValuesSection() {
  const { t } = useTranslation();

  return (
    <section className="home-alt-values">
      <div className="home-section-container home-alt-values__container">
        <ul className="home-alt-values__list">
          {HOME_ALT_VALUES.map((item) => {
            const title = t(item.titleKey);
            const desc = t(item.descKey);
            return (
            <li key={item.titleKey} className="home-alt-values__item">
              <img className="home-alt-values__icon" src={item.iconSrc} alt="" aria-hidden="true" />
              <div className="home-alt-values__text">
                <h3 className="home-alt-values__title" title={title}>{title}</h3>
                <p className="home-alt-values__desc" title={desc}>{desc}</p>
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
