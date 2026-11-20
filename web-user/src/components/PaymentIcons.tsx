import React from 'react';
import { SiWechat, SiAlipay, SiStripe } from 'react-icons/si';

interface IconProps {
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

/** 微信支付图标（官方绿 #07C160） */
export function WechatPayIcon({ size = 18, style, className }: IconProps) {
  return <SiWechat size={size} color="#07C160" className={className} style={style} />;
}

/** 支付宝图标（品牌蓝 #1677FF） */
export function AlipayIcon({ size = 18, style, className }: IconProps) {
  return <SiAlipay size={size} color="#1677FF" className={className} style={style} />;
}

/** Stripe 图标（品牌紫 #635BFF） */
export function StripeIcon({ size = 18, style, className }: IconProps) {
  return <SiStripe size={size} color="#635BFF" className={className} style={style} />;
}

/** 通用支付方式颜色圆点 */
export function PaymentDot({ color, size = 12, style }: { color: string; size?: number; style?: React.CSSProperties }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: color, 
      flexShrink: 0,
      ...style,
    }} />
  );
}
