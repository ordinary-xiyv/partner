import { useTranslation } from 'react-i18next';
import { useReveal } from '../shared/motion';
import { TerminalSectionHead } from './TerminalSectionHead';
import './terminal.css';

/**
 * B 终端网格 · 为什么选我们
 *
 * 与 EditorialScenes 内容完全一致，只换阅读语言：终端风格用两列、
 * 每项左侧一个等宽标签，像一条条系统说明；纸感是四栏带衬线标题。
 *
 * 原来这块叫 Scenarios（应用场景），内容讲的是模型能力。改名的理由见
 * EditorialScenes 的注释 —— 同一个判断，两套骨架必须一起改，
 * 否则切换风格时访客会看到两套说法。
 */
export function TerminalScenes() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLDivElement>({ stagger: 0.06, y: 14 });

  const items = [1, 2, 3, 4].map((n) => ({
    n,
    tag: t(`homeAlt.whyCard${n}Tag`),
    title: t(`homeAlt.whyCard${n}Title`),
    desc: t(`homeAlt.whyCard${n}Desc`),
  }));

  return (
    <section className="tm-section tm-shell" aria-labelledby="tm-scenes-title">
      <TerminalSectionHead
        id="tm-scenes-title"
        label="Why"
        title={t('homeAlt.whyTitle')}
        desc={t('homeAlt.whySubtitle')}
      />
      <div className="tm-scenes" ref={ref}>
        {items.map((item) => (
          <div className="tm-scene" key={item.n} data-reveal-item>
            <span className="tm-scene__tag tm-mono">{item.tag}</span>
            <div>
              <h3 className="tm-scene__title">{item.title}</h3>
              <p className="tm-scene__desc">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
