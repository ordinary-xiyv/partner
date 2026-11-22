import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useReveal } from '../shared/motion';
import './terminal.css';

/**
 * B 终端网格 · 首屏
 *
 * 与 A 的关键差异：这里有一行「正在被输入的文字」+ 闪烁光标。
 * 那不是装饰 —— 它把「这是个能跑起来的东西」这件事直接演出来了，
 * 比写「高可用」「稳定」这类形容词有效。
 *
 * 指标条摆在首屏下方（A 摆在右侧），因为终端风格是横向推进的阅读顺序，
 * 竖直方向留给下一个小节。
 */
export function TerminalHero({ onPrimaryAction }: { onPrimaryAction: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const ref = useReveal<HTMLDivElement>({ stagger: 0.07, y: 18 });
  const metricsRef = useReveal<HTMLDivElement>({ stagger: 0.06, y: 14 });

  /*
   * 指标条从「4 个数字」改成「3 条声明」。
   *
   * 原来的 100+ 模型 / 2W+ 企业客户 / 70% 成本节省 / 99.9% 稳定性
   * 是四个没法验证的数字：真实模型数只有 47，访客点进模型页一数就露馅，
   * 剩下三个更是无从查证。首页一旦被抓到一个假数字，后面写什么都会被怀疑。
   *
   * 现在换成三条纯事实声明，不承诺任何具体数值 —— 也就没有「说错」的余地。
   * 用 useCountUp 的动画因此一并去掉：没有数字可数。
   */
  const metrics = [
    t('homeAlt.statModelsLabel'),
    t('homeAlt.statCompatLabel'),
    t('homeAlt.statBillingLabel'),
  ];

  return (
    <section className="tm-hero tm-shell" aria-label={t('homeAlt.heroAria')}>
      <div className="tm-hero__body" ref={ref}>
        <div className="tm-hero__status" data-reveal-item>
          <span className="tm-hero__status-dot" aria-hidden="true" />
          {t('homeAlt.heroEyebrow')}
        </div>

        <h1 className="tm-hero__title">
          <span className="tm-hero__title-line" data-reveal-item>
            {t('home.heroTitleLine1')}
          </span>
          <span className="tm-hero__title-line" data-reveal-item>
            <span className="tm-hero__typed">{t('home.heroTitleAccent')}</span>
            <span className="tm-hero__cursor" aria-hidden="true" />
          </span>
        </h1>

        {/*
          副标题固定两句两行，各占一行。
          
          原来是一整句放在 <p> 里靠宽度自动折行，结果断点由浏览器按容器宽度
          决定 —— 560px 装不下整句（实测 609px），于是断在句子中间：
          「…主流能力。兼容 OpenAI 接口，现有项目改个」/「地址即可运行。」
          读起来像断了一半。
          
          改为两句两个块，与语种无关，不依赖标点做运行时切分
          （泰语没有句号，切分会失败）。每句都远短于容器宽度，不会二次折行。
        */}
        <p className="tm-hero__lead" data-reveal-item>
          <span className="tm-hero__lead-line">{t('homeAlt.heroSubtitleLine1')}</span>
          <span className="tm-hero__lead-line">{t('homeAlt.heroSubtitleLine2')}</span>
        </p>

        <div className="tm-hero__cta" data-reveal-item>
          <button type="button" className="tm-btn-primary" onClick={onPrimaryAction}>
            {t('home.getApiKey')}
            <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="tm-btn-sec" onClick={() => navigate('/models')}>
            {t('home.heroSecondaryCta')}
          </button>
        </div>
      </div>

      <div className="tm-hero__metrics" ref={metricsRef}>
        {metrics.map((text, i) => (
          <div className="tm-hero__metric tm-hero__metric--text" key={i} data-reveal-item>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
