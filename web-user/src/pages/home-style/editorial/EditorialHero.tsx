import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGrowLine, useReveal } from '../shared/motion';
import './editorial.css';

/**
 * A 纸感编辑 · 首屏
 *
 * 结构上刻意与 B（终端）不同：这里没有"卡片"这个概念，
 * 全部由文字块 + 细线组成。视觉重量靠字号和留白建立。
 *
 * 左侧：眉标 → 衬线大标题 → 引文 → 两个动作
 * 右侧：三条事实声明，用细线分隔
 *
 * 右侧那一块原来的形态是「一个巨大的数字 + 两个小指标」（100+ 模型 /
 * 2W+ 企业客户 / 99.9% 稳定性）。三个数字里有两个无从验证，而且真实
 * 模型数只有 47 —— 访客一旦点进模型页就会发现对不上。
 *
 * 现在改成三条不承诺数值的声明，右侧就从「数据牌」变成了「提要栏」：
 * 字号降下来、用衬线引文的排版语言，和左侧的编辑感统一。
 */
export function EditorialHero({ onPrimaryAction }: { onPrimaryAction: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const heroRef = useReveal<HTMLDivElement>({ stagger: 0.07, y: 20 });
  const figureRef = useReveal<HTMLDivElement>({ stagger: 0.08, y: 16 });
  const ruleRef = useGrowLine<HTMLDivElement>();

  /** 三条纯文字声明，顺序与语言包里的一致 */
  const claims = [
    t('homeAlt.statModelsLabel'),
    t('homeAlt.statCompatLabel'),
    t('homeAlt.statBillingLabel'),
  ];

  return (
    <section className="ed-hero ed-shell" aria-label={t('homeAlt.heroAria')}>
      <div ref={heroRef}>
        <div className="ed-hero__eyebrow" data-reveal-item>
          <span className="ed-hero__eyebrow-dot" aria-hidden="true" />
          {t('homeAlt.heroEyebrow')}
        </div>

        <h1 className="ed-hero__title ed-serif">
          {/*
            * 用 em 包强调词，CSS 里 .ed-hero__title em 会走派生后的可读色。
            * 不能直接给 span 上 color:var(--ed-brand)——那是主色原值，
            * 明黄之类在米白底上完全看不清。
            *
            * 两行分别是 heroTitleLine1（"一个 API"）和 heroTitleAccent
            * （"接入主流 AI 模型"）。这一组键在 5 种语言里都有，
            * 不需要为首页新增翻译。
            */}
          <span className="ed-hero__title-line" data-reveal-item>
            {t('home.heroTitleLine1')}
          </span>
          <span className="ed-hero__title-line" data-reveal-item>
            <em>{t('home.heroTitleAccent')}</em>
          </span>
        </h1>

        {/* 两句两行，各占一行；理由见 TerminalHero 同一处的注释 */}
        <p className="ed-hero__lead" data-reveal-item>
          <span className="ed-hero__lead-line">{t('homeAlt.heroSubtitleLine1')}</span>
          <span className="ed-hero__lead-line">{t('homeAlt.heroSubtitleLine2')}</span>
        </p>

        <div className="ed-hero__cta" data-reveal-item>
          <button type="button" className="ed-btn-solid" onClick={onPrimaryAction}>
            {t('home.getApiKey')}
            <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="ed-btn-ghost" onClick={() => navigate('/models')}>
            {t('home.heroSecondaryCta')}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <div className="ed-hero__figure ed-hero__figure--claims" ref={figureRef}>
        <div className="ed-hero__claims">
          {claims.map((text, i) => (
            <div className="ed-hero__claim" key={i} data-reveal-item>
              <span className="ed-hero__claim-no ed-serif" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="ed-hero__claim-text">{text}</span>
            </div>
          ))}
        </div>
        <div className="ed-hero__figure-rule" ref={ruleRef} aria-hidden="true" />
      </div>
    </section>
  );
}
