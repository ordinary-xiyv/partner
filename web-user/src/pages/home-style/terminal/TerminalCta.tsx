import { useTranslation } from 'react-i18next';
import { useReveal } from '../shared/motion';
import './terminal.css';

/**
 * B 终端网格 · 结尾 CTA
 *
 * 不像 A 那样整块反白，用一层极淡的主色底 + 上下边线收尾。
 * 这套语言里「深色块」的角色已经由终端代码窗口占用了，
 * CTA 再来一块深色会互相削弱。
 */
export function TerminalCta({ onPrimaryAction }: { onPrimaryAction: () => void }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLDivElement>({ stagger: 0.08, y: 16 });

  return (
    <section className="tm-cta">
      <div className="tm-shell tm-cta__inner" ref={ref}>
        <div>
          <h2 className="tm-cta__title" data-reveal-item>{t('homeAlt.ctaTitle')}</h2>
          <p className="tm-cta__desc" data-reveal-item>
            {t('homeAlt.ctaDesc', { brandName: t('siteName') })}
          </p>
        </div>
        <div className="tm-cta__actions" data-reveal-item>
          <button type="button" className="tm-btn-primary" onClick={onPrimaryAction}>
            {t('home.getApiKey')}
            <span aria-hidden="true">→</span>
          </button>
          <span className="tm-cta__hint tm-mono">{t('homeAlt.footerConnect')}</span>
        </div>
      </div>
    </section>
  );
}
