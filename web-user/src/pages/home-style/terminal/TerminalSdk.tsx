import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePartnerSiteBrand } from '../../../hooks/usePartnerSiteBrand';
import { buildSdkSnippet, resolveSiteBaseUrl, type SdkLang } from '../shared/sdkSnippets';
import { highlightCode } from '../shared/highlightCode';
import { useReveal } from '../shared/motion';
import { useTypewriter, useTypewriterOnVisible } from '../shared/useTypewriter';
import { TerminalSectionHead } from './TerminalSectionHead';
import './terminal.css';

const LANGS: Array<{ id: SdkLang; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'Node' },
];


/**
 * B 终端网格 · SDK 接入
 *
 * 这里代码块是真的终端窗口：深底、三个圆点、等宽。亮色模式下也是深的 ——
 * 一个浅色的「终端窗口」在语义上不成立，会变成一个普通的灰盒子。
 *
 * 默认选中 cURL 而不是 Python：curl 是"零依赖验证"最直接的形式，
 * 对「能不能跑」的疑问回答得最快。
 */
export function TerminalSdk() {
  const { t } = useTranslation();
  /*
   * 取伙伴后台配的接口基地址，不再取主站的 status.server_address。
   *
   * 这一处就是「分销商首页示例指向主站」的直接原因：原来的代码把
   * /api/status 返回的 server_address（主站 IP）当成第一优先级传进去，
   * 于是每个分销商站点上的 curl 都写着主站地址。
   */
  const { brand } = usePartnerSiteBrand();
  const [lang, setLang] = useState<SdkLang>('curl');

  const baseUrl = useMemo(() => resolveSiteBaseUrl(brand?.api_base_url), [brand?.api_base_url]);
  const snippet = useMemo(() => buildSdkSnippet(lang, baseUrl), [lang, baseUrl]);
  const tokens = useMemo(() => highlightCode(snippet), [snippet]);

  const codeRef = useReveal<HTMLDivElement>({ y: 16 });
  const featRef = useReveal<HTMLDivElement>({ stagger: 0.06, y: 14 });

  /*
   * 打字机只在「区块第一次进入视口」时演一遍，之后切换 tab 直接给全量。
   * 具体规则见 shared/useTypewriter 的 useTypewriterOnVisible。
   */
  const { ref: sdkRef, armed, disarm } = useTypewriterOnVisible();

  const visibleTokens = useTypewriter(tokens, armed, disarm);

  const features = [1, 2, 3].map((n) => ({
    n,
    title: t(`homeAlt.sdkFeature${n}Title`),
    desc: t(`homeAlt.sdkFeature${n}Desc`),
  }));

  return (
    <section className="tm-section tm-shell" aria-labelledby="tm-sdk-title">
      <TerminalSectionHead
        id="tm-sdk-title"
        label="Quickstart"
        title={t('homeAlt.sdkTitle')}
        desc={t('homeAlt.sdkSubtitle')}
      />

      <div className="tm-sdk" ref={sdkRef}>
        <div className="tm-sdk__code" ref={codeRef} aria-label={t('homeAlt.sdkEditorAria')}>
          <div className="tm-sdk__code-bar">
            <div className="tm-sdk__dots" aria-hidden="true">
              <i /><i /><i />
            </div>
            <div className="tm-sdk__tabs">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`tm-sdk__tab${lang === l.id ? ' is-active' : ''}`}
                  onClick={() => setLang(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <pre>
            <code>
              {visibleTokens.map((part, i) =>
                part.cls ? (
                  <span key={i} className={part.cls}>{part.text}</span>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </code>
          </pre>
        </div>

        <div className="tm-sdk__features" ref={featRef}>
          {features.map((f) => (
            <div className="tm-sdk__feature" key={f.n} data-reveal-item>
              <h3 className="tm-sdk__feature-title">{f.title}</h3>
              <p className="tm-sdk__feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
