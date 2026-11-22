import React from 'react';
import { Tag } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import {
  HOME_STYLE_EDITORIAL,
  HOME_STYLE_TERMINAL,
  type HomeStyle,
} from '@lynx/shared';

/**
 * 首页风格选择器。
 *
 * 为什么做成两张可视卡片而不是一个 Select：
 * 经销商不是设计师，「editorial / terminal」这两个词对他没有意义，
 * 必须让他看到样子。这里用两幅缩略示意（纯 CSS 画的骨架）表达差异，
 * 比起放两张截图更好——截图会随平台改版而过时，
 * 而且截图里的品牌名/主色和这个商户自己的不一样，容易误导。
 *
 * 缩略图特意用当前生效的主色渲染，所以经销商选之前就能看到
 * 「我的品牌色放在这套版式里是什么样」。
 */
export function HomeStylePicker({
  value,
  previewColor,
  onChange,
  disabled,
}: {
  value: HomeStyle;
  /** 伙伴当前主色，用于缩略图 */
  previewColor: string;
  onChange: (next: HomeStyle) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: 14,
      }}
    >
      <StyleCard
        id={HOME_STYLE_EDITORIAL}
        name="纸感编辑"
        en="Editorial"
        selected={value === HOME_STYLE_EDITORIAL}
        disabled={disabled}
        onClick={onChange}
        previewColor={previewColor}
        bullets={[
          '米白纸面 + 衬线大标题',
          '主色只做编号与细线，占比不到 3%',
          '任何主色都不会失控，最稳妥',
        ]}
        renderPreview={(color) => <EditorialThumb color={color} />}
      />
      <StyleCard
        id={HOME_STYLE_TERMINAL}
        name="终端网格"
        en="Terminal"
        selected={value === HOME_STYLE_TERMINAL}
        disabled={disabled}
        onClick={onChange}
        previewColor={previewColor}
        bullets={[
          '细网格 + 等宽标签 + 光标',
          '主色作辉光，技术感最强',
          '适合以 API / SDK 用户为主的客群',
        ]}
        renderPreview={(color) => <TerminalThumb color={color} />}
      />
    </div>
  );
}

function StyleCard({
  id,
  name,
  en,
  selected,
  disabled,
  onClick,
  bullets,
  renderPreview,
  previewColor,
}: {
  id: HomeStyle;
  name: string;
  en: string;
  selected: boolean;
  disabled?: boolean;
  onClick: (id: HomeStyle) => void;
  bullets: string[];
  renderPreview: (color: string) => React.ReactNode;
  previewColor: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onClick(id)}
      style={{
        textAlign: 'left',
        padding: 0,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: 'var(--bg-elevated)',
        border: selected
          ? '2px solid var(--theme-color-primary, #6d51fe)'
          : '1px solid var(--border-default)',
        transition: 'border-color .18s ease, transform .18s ease',
        opacity: disabled ? 0.6 : 1,
        font: 'inherit',
        color: 'inherit',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 缩略示意区：等比 16:10，纯 CSS 画骨架 */}
      <div style={{ position: 'relative', background: '#fff', borderBottom: '1px solid var(--border-default)' }}>
        {renderPreview(previewColor)}
        {selected ? (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 999,
              background: 'var(--theme-color-primary, #6d51fe)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <CheckCircleFilled style={{ fontSize: 11 }} /> 当前
          </span>
        ) : null}
      </div>

      <div style={{ padding: '13px 15px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '.04em' }}>{en}</span>
          {id === HOME_STYLE_EDITORIAL ? (
            <Tag color="green" style={{ margin: 0, fontSize: 10, lineHeight: '16px', marginLeft: 'auto' }}>
              最稳
            </Tag>
          ) : null}
        </div>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.85, color: 'var(--text-secondary)' }}>
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </button>
  );
}

/** A 的骨架示意：左大块文字 + 右数字 + 三列底线 */
function EditorialThumb({ color }: { color: string }) {
  return (
    <div style={{ padding: '16px 16px 14px', background: '#f7f5f0', aspectRatio: '16 / 10' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ width: 34, height: 5, borderRadius: 2, background: 'rgba(23,21,15,.2)' }} />
        <div style={{ display: 'flex', gap: 5 }}>
          {[12, 12, 12].map((w, i) => (
            <span key={i} style={{ width: w, height: 3, borderRadius: 2, background: 'rgba(23,21,15,.14)' }} />
          ))}
        </div>
      </div>
      {/* 强调词用主色，但只有一小段 */}
      <div style={{ width: '78%', height: 8, borderRadius: 2, background: 'rgba(23,21,15,.72)', marginBottom: 5 }} />
      <div style={{ width: '52%', height: 8, borderRadius: 2, background: color, marginBottom: 12 }} />
      <div style={{ width: '64%', height: 3, borderRadius: 2, background: 'rgba(23,21,15,.16)', marginBottom: 4 }} />
      <div style={{ width: '48%', height: 3, borderRadius: 2, background: 'rgba(23,21,15,.16)' }} />
      <div style={{ display: 'flex', gap: 0, marginTop: 16, borderTop: '2px solid rgba(23,21,15,.14)' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, paddingTop: 7, paddingRight: 6 }}>
            <div style={{ width: 8, height: 2, borderRadius: 1, background: color, marginBottom: 5 }} />
            <div style={{ width: '80%', height: 3, borderRadius: 2, background: 'rgba(23,21,15,.4)', marginBottom: 3 }} />
            <div style={{ width: '60%', height: 2, borderRadius: 1, background: 'rgba(23,21,15,.14)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** B 的骨架示意：网格底 + 辉光 + 一行"打字中"的主色文字 */
function TerminalThumb({ color }: { color: string }) {
  return (
    <div
      style={{
        background: '#08090b',
        aspectRatio: '16 / 10',
        position: 'relative',
        overflow: 'hidden',
        padding: '16px 16px 14px',
      }}
    >
      {/* 56px 网格按缩略比例缩小成 14px */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(242,244,247,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(242,244,247,.05) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(120px 60px at 50% -6%, ${hexAlpha(color, 0.28)}, transparent 70%)`,
        }}
      />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ width: 30, height: 5, borderRadius: 2, background: 'rgba(242,244,247,.22)' }} />
          <div style={{ width: 26, height: 7, borderRadius: 3, border: `1px solid ${hexAlpha(color, 0.5)}` }} />
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            borderRadius: 999,
            border: `1px solid ${hexAlpha(color, 0.32)}`,
            marginBottom: 9,
          }}
        >
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: color }} />
          <span style={{ width: 18, height: 2, borderRadius: 1, background: hexAlpha(color, 0.6) }} />
        </div>
        <div style={{ width: '72%', height: 7, borderRadius: 2, background: 'rgba(242,244,247,.82)', marginBottom: 5 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 14 }}>
          <div style={{ width: '44%', height: 7, borderRadius: 2, background: color }} />
          <span style={{ width: 2, height: 8, background: color, boxShadow: `0 0 6px ${hexAlpha(color, 0.9)}` }} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 26,
                borderRadius: 4,
                border: '1px solid rgba(242,244,247,.1)',
                background: 'rgba(255,255,255,.035)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** 把 hex 转成 rgba 字符串，缩略图里的半透明主色用 */
function hexAlpha(hex: string, alpha: number): string {
  let h = (hex || '#6d51fe').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return `rgba(109,81,254,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
