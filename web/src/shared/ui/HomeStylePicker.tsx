import React from 'react';
import {
  HOME_STYLE_EDITORIAL,
  HOME_STYLE_TERMINAL,
  type HomeStyle,
} from '@lynx/shared';
import './home-style-picker.css';

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
 *
 * ★ 结构严格照原型 .style-card：
 *     缩略图 72px（纯色底 + 两条线）
 *     名称 12.5px/600 + 小胶囊
 *     描述一行 11.5px
 *   之前是「16:10 大缩略图 + 三条 bullet 列表」，单卡高 359px、
 *   原型只有 132px —— 两张卡占掉大半屏，和原型的轻量观感完全不同。
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
    <div className="home-style-grid">
      <StyleCard
        id={HOME_STYLE_EDITORIAL}
        name="纸感编辑"
        desc="米白纸面 + 衬线大标题，主色只做细线"
        pill="最稳"
        selected={value === HOME_STYLE_EDITORIAL}
        disabled={disabled}
        onClick={onChange}
        color={previewColor}
      />
      <StyleCard
        id={HOME_STYLE_TERMINAL}
        name="终端网格"
        desc="细网格 + 等宽标签，主色作辉光"
        selected={value === HOME_STYLE_TERMINAL}
        disabled={disabled}
        onClick={onChange}
        color={previewColor}
      />
    </div>
  );
}

function StyleCard({
  id,
  name,
  desc,
  pill,
  selected,
  disabled,
  onClick,
  color,
}: {
  id: HomeStyle;
  name: string;
  desc: string;
  pill?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: (id: HomeStyle) => void;
  color: string;
}) {
  const isEditorial = id === HOME_STYLE_EDITORIAL;
  return (
    <button
      type="button"
      className="home-style-card"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onClick(id)}
    >
      {/* 缩略示意：72px 高，纯 CSS 画骨架，不依赖图片 */}
      <div className={`home-style-card__thumb ${isEditorial ? 'is-editorial' : 'is-terminal'}`}>
        <div className="l1" style={isEditorial ? undefined : { background: color, boxShadow: `0 0 9px ${color}` }} />
        <div className="l2" />
        {isEditorial ? <div className="rule" style={{ background: color }} /> : null}
      </div>

      <div className="home-style-card__meta">
        <div className="home-style-card__name">
          {name}
          {pill ? <span className="home-style-card__pill">{pill}</span> : null}
          {selected ? <span className="home-style-card__pill is-on">当前</span> : null}
        </div>
        <div className="home-style-card__desc">{desc}</div>
      </div>
    </button>
  );
}
