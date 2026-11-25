import React, { useMemo } from 'react';
import { Tag } from 'antd';
import { BrandLogo } from './BrandLogo';
import { buildAntdTheme } from '../theme/antdTheme';
import { deriveBrandPalette, primaryRgba } from '../theme/brandTokens';
import type { TenantBrand } from '../types/tenant';
import { useTheme } from '../theme/ThemeProvider';
import './brand-preview.css';

/**
 * 品牌预览：把「配置值」渲染成真实观感。
 *
 * 为什么不用 swatches 色块糊一下就行：
 * 经销商改主色时真正要判断的是「按钮上字能不能看清」「hover 是否同色系」，
 * 只给一个色块看不出这些问题。这里直接渲染一个迷你控制台：
 * 侧栏 + 标题 + 主按钮 + 次按钮 + 选中菜单 + 链接。
 */
export function BrandPreview({ brand }: { brand: Pick<TenantBrand, 'name' | 'short_name' | 'logo_url' | 'primary_color' | 'page_title'> }) {
  const { resolved } = useTheme();
  const palette = useMemo(
    () => deriveBrandPalette(resolved, brand.primary_color),
    [resolved, brand.primary_color],
  );
  // 用真实 antd 主题配置渲染，所见即所得；只改 primary 一项也能看出联动
  const theme = useMemo(() => buildAntdTheme(resolved, brand.primary_color), [resolved, brand.primary_color]);

  return (
    <div className="lynx-brand-preview">
      <div className="lynx-brand-preview__chrome">
        <span className="lynx-brand-preview__dot" />
        <span className="lynx-brand-preview__dot" />
        <span className="lynx-brand-preview__dot" />
        <span className="lynx-brand-preview__url">{brand.page_title || brand.name}</span>
      </div>

      <div
        className="lynx-brand-preview__body"
        style={
          {
            // 预览区域自成一套变量，不影响页面外层。
            // 用 primaryRgba 而不是手写 parseInt：主色可能是 #abc 三位缩写，手解析会得到 NaN。
            '--accent-primary': palette.primary,
            // 预览里也有「主色当文字」的元素（导航选中项），必须一并给，
            // 否则会掉回外层作用域的值，预览色与实际渲染不一致
            '--accent-text': palette.text,
            '--accent-primary-rgba-08': primaryRgba(palette.primary, 0.08),
            '--accent-primary-rgba-12': primaryRgba(palette.primary, 0.12),
            '--accent-primary-rgba-20': primaryRgba(palette.primary, 0.2),
            '--btn-primary-text': palette.onPrimary,
          } as React.CSSProperties
        }
      >
        <div className="lynx-brand-preview__sidebar">
          <div className="lynx-brand-preview__brand">
            <BrandLogo
              name={brand.name}
              shortName={brand.short_name}
              logoUrl={brand.logo_url}
              size={22}
              radius={6}
            />
            <span className="lynx-brand-preview__brand-name">{brand.name}</span>
          </div>
          <div className="lynx-brand-preview__nav">
            <span className="lynx-brand-preview__nav-item lynx-brand-preview__nav-item--active">
              控制台首页
            </span>
            <span className="lynx-brand-preview__nav-item">API 令牌</span>
            <span className="lynx-brand-preview__nav-item">调用日志</span>
          </div>
        </div>

        <div className="lynx-brand-preview__main">
          {/*
            这里原本显示 brand.tagline（「一句话介绍」）。2026-11-25 那一格从
            后台表单里删了 —— 客户站根本没有渲染它的地方，预览里还照原样展示
            反而在骗商户「填了就长这样」。改成侧栏那个选中项的实际名字，
            和左边导航的「控制台首页」对上，预览才自洽。
          */}
          <div className="lynx-brand-preview__title">控制台首页</div>
          <div className="lynx-brand-preview__hint">主色 / 状态色 / 按钮文字色联动效果</div>

          <div className="lynx-brand-preview__buttons">
            <button
              type="button"
              className="lynx-brand-preview__btn lynx-brand-preview__btn--primary"
              style={{ background: palette.primary, color: palette.onPrimary }}
            >
              主按钮
            </button>
            <button
              type="button"
              className="lynx-brand-preview__btn lynx-brand-preview__btn--ghost"
              style={{
                color: palette.primary,
                borderColor: palette.primary,
                background: 'transparent',
              }}
            >
              次按钮
            </button>
            <span className="lynx-brand-preview__link" style={{ color: palette.primary }}>
              文字链接
            </span>
          </div>

          <div className="lynx-brand-preview__states">
            <StateChip label="默认" color={palette.primary} textColor={palette.onPrimary} />
            <StateChip label="hover" color={palette.hover} textColor={palette.onPrimary} />
            <StateChip label="active" color={palette.active} textColor={palette.onPrimary} />
            <Tag
              style={{
                margin: 0,
                fontSize: 10,
                borderColor: palette.primary,
                color: palette.primary,
                background: 'transparent',
              }}
            >
              标签
            </Tag>
          </div>
        </div>
      </div>

      {/* 主题接口核对：这两个值必须和上面渲染的一致，否则说明 CSS 变量和 antd token 脱节 */}
      <div className="lynx-brand-preview__meta">
        <span>antd colorPrimary = {String(theme.token?.colorPrimary)}</span>
        <span>按钮文字色 = {palette.onPrimary}</span>
      </div>
    </div>
  );
}

function StateChip({
  label,
  color,
  textColor,
}: {
  label: string;
  color: string;
  textColor: string;
}) {
  return (
    <span className="lynx-brand-preview__chip" style={{ background: color, color: textColor }}>
      {label}
    </span>
  );
}
