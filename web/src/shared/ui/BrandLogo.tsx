import React from 'react';
import './brand-logo.css';

/**
 * 品牌标识：有 logo 用 logo，没有就用「主色圆角方块 + 首字」。
 *
 * 两种形态都要能用，因为经销商不一定会上传 logo：
 *  - 上传了 → 显示图片，容器保持正方形，图片完整缩放不裁切（logo 常带自己的留白）
 *  - 没上传 → 主色底 + 首字，视觉上仍然成立，不是「空白占位」
 *
 * 尺寸走 size 参数，字号按 0.5 倍跟随，避免小尺寸时字挤满方块。
 */
export function BrandLogo({
  name,
  shortName,
  logoUrl,
  size = 28,
  radius = 8,
  className = '',
}: {
  name: string;
  shortName?: string;
  logoUrl?: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  const initial = (shortName || name || 'A').trim().slice(0, 1) || 'A';

  if (logoUrl) {
    return (
      <span
        className={['lynx-brand-logo', className].filter(Boolean).join(' ')}
        style={{ width: size, height: size, borderRadius: radius, background: 'transparent' }}
      >
        <img src={logoUrl} alt={name} className="lynx-brand-logo__img" />
      </span>
    );
  }

  return (
    <span
      className={['lynx-brand-logo', className].filter(Boolean).join(' ')}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--accent-primary)',
        color: 'var(--btn-primary-text, #fff)',
        fontSize: Math.round(size * 0.5),
      }}
    >
      {initial}
    </span>
  );
}
