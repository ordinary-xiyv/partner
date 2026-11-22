import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePartnerSiteBrand } from '../../../hooks/usePartnerSiteBrand';
import { buildSdkSnippet, resolveSiteBaseUrl, type SdkLang } from '../shared/sdkSnippets';
import { highlightCode } from '../shared/highlightCode';
import { useReveal } from '../shared/motion';
import { useTypewriter, useTypewriterOnVisible } from '../shared/useTypewriter';
import { EditorialSectionHead } from './EditorialSectionHead';
import './editorial.css';

const LANGS: Array<{ id: SdkLang; label: string }> = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'curl', label: 'cURL' },
];

/**
 * A 纸感编辑 · SDK 接入
 *
 * 代码块在这套设计里被当作「引文」处理：浅底 + 左侧主色细线，
 * 不做成深色终端窗口。原因是暗色代码块会在一整页米白里形成
 * 一个视觉黑洞，把注意力从「怎么接入」抢到「这个框好酷」上。
 *
 * 三个语言片段的**行数并不相同**（Python/JS 13 行，cURL 8 行）。
 * 原来每个片段按自身内容撑高，于是切 tab 时整个右栏会跳一下：
 * cURL 矮 119px，下方的正文跟着上移。现在给代码区一个固定行数
 * （见 editorial.css 的 --ed-sdk-code-lines），三个片段同高、切 tab 不跳。
 */
export function EditorialSdk() {
  const { t } = useTranslation();
  // 同 TerminalSdk：用伙伴配的接口基地址，不用主站的 server_address
  const { brand } = usePartnerSiteBrand();
  const [lang, setLang] = useState<SdkLang>('python');

  const baseUrl = useMemo(() => resolveSiteBaseUrl(brand?.api_base_url), [brand?.api_base_url]);
  const snippet = useMemo(() => buildSdkSnippet(lang, baseUrl), [lang, baseUrl]);
  const tokens = useMemo(() => highlightCode(snippet), [snippet]);

  /* 打字机：与终端风格同一套实现（shared/useTypewriter），只在首次进入视口演一遍 */
  const { ref: sdkRef, armed, disarm } = useTypewriterOnVisible();
  const visibleTokens = useTypewriter(tokens, armed, disarm);

  const leftRef = useReveal<HTMLDivElement>({ stagger: 0.07, y: 16 });
  const codeRef = useReveal<HTMLDivElement>({ y: 18 });

  const features = [1, 2, 3].map((n) => ({
    n,
    title: t(`homeAlt.sdkFeature${n}Title`),
    desc: t(`homeAlt.sdkFeature${n}Desc`),
  }));

  return (
    <section className="ed-section ed-shell" aria-labelledby="ed-sdk-title">
      <EditorialSectionHead
        index="01 / Integration"
        title={<span id="ed-sdk-title">{t('homeAlt.sdkTitle')}</span>}
        desc={t('homeAlt.sdkSubtitle')}
      />

      {/*
        ed-sdk 是一个两列 grid。右栏（代码块）用固定行数撑出高度，
        左栏（特性列表）需要与之等高 —— 否则代码块比左栏高出一大截，
        视线沿右边落到下方时，左边是一块空白。
        做法见 editorial.css 的 .ed-sdk / .ed-sdk__left。
      */}
      <div className="ed-sdk" ref={sdkRef}>
        <div className="ed-sdk__left" ref={leftRef}>
          <div className="ed-sdk__features">
            {features.map((f) => (
              <div className="ed-sdk__feature" key={f.n} data-reveal-item>
                <div className="ed-sdk__feature-mark ed-mono">{`0${f.n}`}</div>
                <div>
                  <h3 className="ed-sdk__feature-title ed-serif">{f.title}</h3>
                  <p className="ed-sdk__feature-desc">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ed-sdk__code" ref={codeRef} aria-label={t('homeAlt.sdkEditorAria')}>
          <div className="ed-sdk__code-bar">
            <div style={{ display: 'flex', gap: 18 }}>
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    font: 'inherit',
                    letterSpacing: 'inherit',
                    textTransform: 'inherit',
                    color: lang === l.id ? 'var(--ed-brand-on-surface)' : 'var(--ed-ink-4)',
                  }}
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
      </div>
    </section>
  );
}
