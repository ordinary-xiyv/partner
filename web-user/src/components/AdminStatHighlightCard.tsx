import { Card, Flex, theme, Typography } from 'antd';
import type { ReactNode } from 'react';

const { Text } = Typography;

export type AdminStatHighlightVariant = 'primary' | 'warning' | 'success' | 'info';

export interface AdminStatHighlightCardProps {
  title: ReactNode;
  value: ReactNode;
  footer?: ReactNode;
  variant: AdminStatHighlightVariant;
  /** 覆盖数值颜色（例如主色底卡片仍用主题色强调数字） */
  valueColor?: string;
  /** 左侧装饰（如图标/占位图，可自行替换为正式素材） */
  leading?: ReactNode;
}

/** 与控制台 Dashboard 卡片一致：antd Card outlined + hoverable，边框/阴影随 ConfigProvider 明暗主题切换 */
export function AdminStatHighlightCard({
  title,
  value,
  footer,
  variant,
  valueColor,
  leading,
}: AdminStatHighlightCardProps) {
  const { token } = theme.useToken();

  const bg =
    variant === 'primary'
      ? `linear-gradient(180deg, ${token.colorPrimaryBg} 0%, ${token.colorBgContainer} 100%)`
      : variant === 'warning'
        ? `linear-gradient(180deg, ${token.orange1} 0%, ${token.colorBgContainer} 100%)`
        : variant === 'success'
          ? `linear-gradient(180deg, ${token.green1} 0%, ${token.colorBgContainer} 100%)`
          : `linear-gradient(180deg, ${token.colorInfoBg} 0%, ${token.colorBgContainer} 100%)`;

  const defaultValueColor =
    variant === 'primary'
      ? token.colorTextHeading
      : variant === 'warning'
        ? token.orange7
        : variant === 'success'
          ? token.green7
          : token.colorInfo;

  return (
    <Card
      className="lynx-interactive-card"
      hoverable
      variant="outlined"
      styles={{
        body: {
          padding: `${token.paddingXL}px ${token.paddingXL}px ${token.paddingLG}px`,
          background: bg,
          minHeight: token.controlHeight * 4 + token.marginLG,
        },
      }}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: token.borderRadiusLG * 1.25,
        overflow: 'hidden',
      }}
    >
      <Flex align="flex-start" gap={token.marginMD}>
        {leading ? <div style={{ flexShrink: 0 }}>{leading}</div> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text
            strong
            style={{
              display: 'block',
              fontSize: token.fontSizeLG,
              fontWeight: token.fontWeightStrong,
              color: token.colorTextSecondary,
              lineHeight: token.lineHeightLG,
              marginBottom: token.marginLG,
            }}
          >
            {title}
          </Text>
          <div
            style={{
              fontSize: token.fontSizeHeading1,
              fontWeight: token.fontWeightStrong,
              color: valueColor ?? defaultValueColor,
              lineHeight: 1.15,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
            }}
          >
            {value}
          </div>
          {footer != null && footer !== '' && (
            <Text
              type="secondary"
              style={{
                fontSize: token.fontSize,
                marginTop: token.marginLG,
                display: 'block',
                lineHeight: token.lineHeight,
                color: token.colorTextTertiary,
              }}
            >
              {footer}
            </Text>
          )}
        </div>
      </Flex>
    </Card>
  );
}
