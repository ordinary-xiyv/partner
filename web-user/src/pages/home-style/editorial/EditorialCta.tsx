import { useTranslation } from 'react-i18next';
import { useReveal } from '../shared/motion';
import './editorial.css';

/**
 * A 纸感编辑 · 结尾 CTA
 *
 * 整页唯一一块深色区域。前面全是米白纸面，这里压深形成视觉收束 ——
 * 这是编辑物常用的「尾页反白」手法。
 *
 * 为什么不用主色铺这块：主色不可控。伙伴配了明黄、浅粉之后，
 * 一整块明黄 CTA 会刺眼到看不清白字（或者显得很廉价）。
 * 用墨色（--ed-ink）铺底，任何主色都不受影响；主色只出现在
 * 前面那些小面积元素上。
 */
export function EditorialCta({ onPrimaryAction }: { onPrimaryAction: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLDivElement>({ stagger: 0.08, y: 18 });

  return (
    <section className="ed-cta">
      <div className="ed-shell ed-cta__inner" ref={ref}>
        <div>
          <h2 className="ed-cta__title ed-serif" data-reveal-item>
            {t('homeAlt.ctaTitle')}
          </h2>
          <p className="ed-cta__desc" data-reveal-item>
            {t('homeAlt.ctaDesc', { brandName: t('siteName') })}
          </p>
        </div>
        <div className="ed-cta__actions" data-reveal-item>
          <button type="button" className="ed-btn-solid" onClick={onPrimaryAction}>
            {t('home.getApiKey')}
            <span aria-hidden="true">→</span>
          </button>
          <span className="ed-cta__hint">{t('homeAlt.footerConnect')}</span>
        </div>
      </div>
    </section>
  );
}
