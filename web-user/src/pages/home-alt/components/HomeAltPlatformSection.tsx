import { useTranslation } from 'react-i18next';
import { HOME_PLATFORM_SCROLL_ANCHOR_ID, HOME_PLATFORM_SECTION_ID } from '../../home/constants/homeSectionIds';
import './home-alt-platform.css';

/**
 * 能力卡片视频：视频文件不入库，放到 web/public/videos/ 下即可生效。
 * 文件名约定见各卡的 videoSrc，替换同名文件就完成换片。
 */
const HOME_ALT_CAP_CARDS = [
  { titleKey: 'homeAlt.capCard1Title', descKey: 'homeAlt.capCard1Desc', videoSrc: '/videos/cap-smart-routing.mp4' },
  { titleKey: 'homeAlt.capCard2Title', descKey: 'homeAlt.capCard2Desc', videoSrc: '/videos/cap-model-switch.mp4' },
  { titleKey: 'homeAlt.capCard3Title', descKey: 'homeAlt.capCard3Desc', videoSrc: '/videos/cap-global-models.mp4' },
] as const;

function HomeAltCapCardChrome() {
  return (
    <div className="home-alt-cap-card__chrome" aria-hidden="true">
      <span className="home-alt-cap-card__dots">
        <i className="home-alt-cap-card__dot home-alt-cap-card__dot--close" />
        <i className="home-alt-cap-card__dot home-alt-cap-card__dot--min" />
        <i className="home-alt-cap-card__dot home-alt-cap-card__dot--zoom" />
      </span>
    </div>
  );
}

export function HomeAltPlatformSection() {
  const { t } = useTranslation();

  return (
    <section id={HOME_PLATFORM_SECTION_ID} className="home-alt-platform">
      <div
        id={HOME_PLATFORM_SCROLL_ANCHOR_ID}
        className="home-section-container home-alt-platform__container home-platform-scroll-anchor"
      >
        <ul className="home-alt-platform__cards">
          {HOME_ALT_CAP_CARDS.map((card) => {
            const title = t(card.titleKey);
            const desc = t(card.descKey);
            return (
            <li key={card.titleKey} className="home-alt-cap-card">
              <HomeAltCapCardChrome />
              <div className="home-alt-cap-card__visual">
                <video
                  className="home-alt-cap-card__video"
                  src={card.videoSrc}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-hidden
                />
              </div>
              <div className="home-alt-cap-card__body">
                <h3 className="home-alt-cap-card__title" title={title}>{title}</h3>
                <p className="home-alt-cap-card__desc" title={desc}>{desc}</p>
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
