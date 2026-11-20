import { useTranslation } from 'react-i18next';
import sceneCoding from '../../../assets/home-alt/scene-coding.png';
import sceneMultimodal from '../../../assets/home-alt/scene-multimodal.png';
import sceneGeneration from '../../../assets/home-alt/scene-generation.png';
import sceneAgent from '../../../assets/home-alt/scene-agent.png';
import './home-alt-scenes.css';

const HOME_ALT_SCENE_CARDS = [
  {
    titleKey: 'homeAlt.sceneCard1Title',
    descKey: 'homeAlt.sceneCard1Desc',
    tagKey: 'homeAlt.sceneCard1Tag',
    imageSrc: sceneCoding,
  },
  {
    titleKey: 'homeAlt.sceneCard2Title',
    descKey: 'homeAlt.sceneCard2Desc',
    tagKey: 'homeAlt.sceneCard2Tag',
    imageSrc: sceneMultimodal,
  },
  {
    titleKey: 'homeAlt.sceneCard3Title',
    descKey: 'homeAlt.sceneCard3Desc',
    tagKey: 'homeAlt.sceneCard3Tag',
    imageSrc: sceneGeneration,
  },
  {
    titleKey: 'homeAlt.sceneCard4Title',
    descKey: 'homeAlt.sceneCard4Desc',
    tagKey: 'homeAlt.sceneCard4Tag',
    imageSrc: sceneAgent,
  },
] as const;

function SceneCardArrow() {
  return (
    <svg className="home-alt-scenes__arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M4 12 L12 4 M12 4 H6 M12 4 V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeAltScenesSection() {
  const { t } = useTranslation();

  return (
    <section className="home-alt-scenes">
      <div className="home-section-container home-alt-scenes__container">
        <header className="home-alt-scenes__head">
          <h2 className="home-alt-scenes__title">{t('homeAlt.scenesTitle')}</h2>
          <p className="home-alt-scenes__subtitle">{t('homeAlt.scenesSubtitle')}</p>
        </header>
        <ul className="home-alt-scenes__grid">
          {HOME_ALT_SCENE_CARDS.map((card) => {
            const title = t(card.titleKey);
            const desc = t(card.descKey);
            const tag = t(card.tagKey);
            return (
            <li key={card.titleKey} className="home-alt-scenes__card">
              <div className="home-alt-scenes__visual" aria-hidden="true">
                <img className="home-alt-scenes__image" src={card.imageSrc} alt="" />
              </div>
              <div className="home-alt-scenes__body">
                <h3 className="home-alt-scenes__card-title" title={title}>{title}</h3>
                <p className="home-alt-scenes__card-desc" title={desc}>{desc}</p>
                <div className="home-alt-scenes__foot">
                  <span className="home-alt-scenes__tag" title={tag}>{tag}</span>
                  <SceneCardArrow />
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
