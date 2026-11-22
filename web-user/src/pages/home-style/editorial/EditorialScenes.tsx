import { useTranslation } from 'react-i18next';
import { useReveal } from '../shared/motion';
import { EditorialSectionHead } from './EditorialSectionHead';
import './editorial.css';

/**
 * A 纸感编辑 · 为什么选我们
 *
 * 这一块原来是「应用场景」，内容是「AI 编程辅助 / 长文本理解 / 图像生成 /
 * Agent 基础」—— 那是模型能干什么，属于模型厂商该讲的话。访客在别处早就
 * 看过八百遍，放在这里既不能说服人，也不构成选择的理由。
 *
 * 现在换成「与直接用官方 API 的差别」：一个账号、一张账单、自动切换、
 * 直连。这四件事是访客真正在做决策时会权衡的 —— 也是这个平台存在的理由。
 *
 * 版式沿用原来的四栏（标签 + 标题 + 说明），因为结构本身没问题，
 * 问题只出在内容上。改内容不改骨架，这一块就不会因为重构而失去原有的
 * 视觉节奏。
 */
export function EditorialScenes() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLDivElement>({ stagger: 0.06, y: 16 });

  const items = [1, 2, 3, 4].map((n) => ({
    n,
    tag: t(`homeAlt.whyCard${n}Tag`),
    title: t(`homeAlt.whyCard${n}Title`),
    desc: t(`homeAlt.whyCard${n}Desc`),
  }));

  return (
    <section className="ed-section ed-shell" aria-labelledby="ed-scenes-title">
      <EditorialSectionHead
        index="02 / Why"
        title={<span id="ed-scenes-title">{t('homeAlt.whyTitle')}</span>}
        desc={t('homeAlt.whySubtitle')}
      />
      <div className="ed-scenes" ref={ref}>
        {items.map((item) => (
          <div className="ed-scene" key={item.n} data-reveal-item>
            <span className="ed-scene__tag ed-mono">{item.tag}</span>
            <h3 className="ed-scene__title ed-serif">{item.title}</h3>
            <p className="ed-scene__desc">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
