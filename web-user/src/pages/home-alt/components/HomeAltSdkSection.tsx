import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStatus } from '../../../contexts/StatusContext';
import {
  buildHomeAltSdkSnippet,
  resolveHomeAltSiteBaseUrl,
  type HomeAltSdkLang,
} from '../constants/homeAltSdkSnippets';
import { useHomeAltCodeTypewriter } from '../hooks/useHomeAltCodeTypewriter';
import sdkOpenaiIcon from '../../../assets/home-alt/sdk-openai.svg';
import sdkUnifiedIcon from '../../../assets/home-alt/sdk-unified.svg';
import sdkDevIcon from '../../../assets/home-alt/sdk-dev.svg';
import './home-alt-sdk.css';

const SDK_TABS: Array<{ id: HomeAltSdkLang; label: string }> = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'curl', label: 'cURL' },
];

const SDK_FEATURES = [
  { titleKey: 'homeAlt.sdkFeature1Title', descKey: 'homeAlt.sdkFeature1Desc', iconSrc: sdkOpenaiIcon },
  { titleKey: 'homeAlt.sdkFeature2Title', descKey: 'homeAlt.sdkFeature2Desc', iconSrc: sdkUnifiedIcon },
  { titleKey: 'homeAlt.sdkFeature3Title', descKey: 'homeAlt.sdkFeature3Desc', iconSrc: sdkDevIcon },
] as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return reduced;
}

export function HomeAltSdkSection() {
  const { t } = useTranslation();
  const { status } = useStatus();
  const isReducedMotion = usePrefersReducedMotion();
  const [activeLang, setActiveLang] = useState<HomeAltSdkLang>('curl');

  const baseUrl = useMemo(
    () => resolveHomeAltSiteBaseUrl(status?.server_address),
    [status?.server_address],
  );

  const source = useMemo(
    () => buildHomeAltSdkSnippet(activeLang, baseUrl),
    [activeLang, baseUrl],
  );

  const typedCode = useHomeAltCodeTypewriter(source, isReducedMotion);
  const lineCount = Math.max(typedCode.split('\n').length, 1);

  return (
    <section className="home-alt-sdk">
      <div className="home-section-container home-alt-sdk__container">
        <header className="home-alt-sdk__head">
          <h2 className="home-alt-sdk__title">{t('homeAlt.sdkTitle')}</h2>
          <p className="home-alt-sdk__subtitle">{t('homeAlt.sdkSubtitle')}</p>
        </header>

        <div className="home-alt-sdk__layout">
          <div className="home-alt-sdk__editor" aria-label={t('homeAlt.sdkEditorAria')}>
            <div className="home-alt-sdk__chrome">
              <span className="home-alt-sdk__dots" aria-hidden="true">
                <i className="home-alt-sdk__dot home-alt-sdk__dot--close" />
                <i className="home-alt-sdk__dot home-alt-sdk__dot--min" />
                <i className="home-alt-sdk__dot home-alt-sdk__dot--zoom" />
              </span>
              <div className="home-alt-sdk__tabs" role="tablist">
                {SDK_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={tab.id === activeLang}
                    className={`home-alt-sdk__tab${tab.id === activeLang ? ' is-active' : ''}`}
                    onClick={() => setActiveLang(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="home-alt-sdk__code-wrap"
              onCopy={(event) => event.preventDefault()}
              onCut={(event) => event.preventDefault()}
            >
              <ol className="home-alt-sdk__lines" aria-hidden="true">
                {Array.from({ length: lineCount }, (_, i) => (
                  <li key={i}>{i + 1}</li>
                ))}
              </ol>
              <pre className="home-alt-sdk__code">
                <code>
                  {typedCode}
                  {!isReducedMotion ? <span className="home-alt-sdk__cursor" aria-hidden="true" /> : null}
                </code>
              </pre>
            </div>
          </div>

          <ul className="home-alt-sdk__features">
            {SDK_FEATURES.map((item) => {
              const title = t(item.titleKey);
              const desc = t(item.descKey);
              return (
              <li key={item.titleKey} className="home-alt-sdk__feature">
                <img className="home-alt-sdk__feature-icon" src={item.iconSrc} alt="" aria-hidden="true" />
                <div className="home-alt-sdk__feature-copy">
                  <h3 title={title}>{title}</h3>
                  <p title={desc}>{desc}</p>
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
