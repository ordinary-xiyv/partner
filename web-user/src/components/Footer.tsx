/**
 * Footer — 全站底部
 *
 * 现在只保留一行：版权 + 条款/隐私/备案。
 *
 * 原来这里还有「关于我们 / 热门产品 / 支持与服务 / 账号与计费 / 友情链接」
 * 五列导航，已经删掉。删的理由不是「不好看」，而是那五列的内容与站点定位不符：
 *
 *   · 「企业合作」「信任与安全」「法律协议」—— 是主站那种企业官网的栏目结构，
 *     分销商的客户站没有这些页面，点进去要么 404 要么跳到主站，等于把访客
 *     从分销商站点送走
 *   · 「友情链接」挂着 OpenAI / Anthropic / Google / DeepSeek 的官网 ——
 *     这些是模型厂商，不是这个站点的合作伙伴。放在页脚的实际效果是告诉访客
 *     「你可以直接去这几家」，而页脚正是访客最后停留的地方
 *   · 五个栏目里真正有用的（文档、模型广场、充值、账单）在页头导航和
 *     控制台侧栏都有一级入口，页脚重复一遍只是把页面拉长
 *
 * 保留版权行是合规需要：ICP 备案号必须展示，条款与隐私声明是法律要求。
 * 三者的文字由伙伴后台配置（见 brand_landing.footer），整块也能关闭。
 */
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStatus } from '../contexts/StatusContext';
import { resolveFooterLegalLabel } from '../utils/footerLegalLabel';
import { isChineseLocale } from '../i18n/resolveLocale';
import { useLocale } from '../i18n/hooks/useLocale';
import './footer.css';

export default function Footer({ className }: { className?: string; fullWidth?: boolean }) {
  const { t } = useTranslation();
  const { siteAppearance } = useStatus();
  const { locale } = useLocale();

  const hidden = useMemo(
    () => new Set(siteAppearance.footer_hidden_items ?? []),
    [siteAppearance.footer_hidden_items],
  );

  const copyrightText = useMemo(
    () => resolveFooterLegalLabel(
      siteAppearance.copyright_labels,
      siteAppearance.copyright_text,
      locale,
    ),
    [siteAppearance.copyright_labels, siteAppearance.copyright_text, locale],
  );

  const legalItems = useMemo(() => {
    /*
     * 条款 / 隐私的文案走后台配置，没配才用 i18n。
     *
     * 这里不能只写 t('footer.terms')：伙伴后台可以把它改成「服务协议」
     * 这类自己的措辞，直接读 i18n 等于把后台那一格变成摆设。
     *
     * hidden 命中表示商户明确清空了这一项 —— 直接不渲染，
     * 而不是回落到 i18n 默认文案（那句话是平台的，挂在分销商站上不合适）。
     */
    const items: Array<{ key: string; label: string; href: string }> = [];

    if (!hidden.has('terms')) {
      const terms = resolveFooterLegalLabel(
        siteAppearance.terms_labels,
        siteAppearance.terms_label,
        locale,
        t('footer.terms'),
      );
      if (terms) items.push({ key: 'terms', label: terms, href: '/legal' });
    }
    if (!hidden.has('privacy')) {
      const privacy = resolveFooterLegalLabel(
        siteAppearance.privacy_labels,
        siteAppearance.privacy_label,
        locale,
        t('footer.privacy'),
      );
      if (privacy) items.push({ key: 'privacy', label: privacy, href: '/legal' });
    }
    /*
     * 备案号只在中文站点展示。
     *
     * 这条不是「翻译问题」而是「监管适用范围」：ICP 备案只对中国大陆
     * 的站点有要求，英文/泰文页面挂一个浙ICP备号反而是噪音。
     */
    if (isChineseLocale(locale) && !hidden.has('beian')) {
      const beian = siteAppearance.beian_label?.trim() || '浙ICP备2026017573号-1';
      items.push({ key: 'beian', label: beian, href: 'https://beian.miit.gov.cn/' });
    }
    return items;
  }, [siteAppearance, locale, t, hidden]);

  /*
   * 整块显隐：伙伴后台关掉后，页脚完全不渲染（连 <footer> 都不留），
   * 免得在页面底部留一条只有分隔线的空白带。
   */
  if (!siteAppearance.footer_copyright_config.enabled) return null;

  /*
   * 版权文字和法务链接都没有内容时，整块也不渲染。
   *
   * 触发场景：商户把版权文字清空、又把条款/隐私/备案全部清空。
   * 这时还留一个空的 <footer>，页面上就是一道多余的横线加一片空白。
   * 注意要放在 enabled 判断之后：开关是「主动关闭」，这个是「没内容可显示」。
   */
  if (!copyrightText && legalItems.length === 0) return null;

  return (
    <footer className={['site-footer', className].filter(Boolean).join(' ')}>
      <div className="site-footer__inner">
        <div className="site-footer__bottom">
          <span className="site-footer__copyright">
            {copyrightText ? (
              copyrightText
            ) : hidden.has('copyright') ? null : (
              <>
                © {new Date().getFullYear()}, {t('footer.companyName')}
                {t('footer.allRightsReserved')}
              </>
            )}
          </span>
          <div className="site-footer__legal">
            {legalItems.map((item, index) => (
              <React.Fragment key={item.key}>
                {index > 0 && <span className="site-footer__legal-sep">|</span>}
                <a
                  href={item.href}
                  className="site-footer__legal-link"
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
