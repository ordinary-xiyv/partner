import type { ThemeConfig } from 'antd/es/config-provider/context';
import {
  primaryRgba,
  readableTextOn,
  resolveBrandPrimaryHex,
  resolveBrandPrimaryStates,
  type ThemeModeResolved,
} from './theme/brandTokens';

/**
 * 与 `theme/brandTokens` + `applyBrandCSSVariables` 对齐，供 Ant 区域主题。
 *
 * `overridePrimaryHex` 是伙伴后台配的主色。传了就整套跟着它派生：
 * hover / active 由它算，主色上的文字色也由它算（浅色主色配白字会糊）。
 */
export function buildAntdTheme(
  resolved: ThemeModeResolved,
  overridePrimaryHex?: string | null,
): Pick<ThemeConfig, 'token' | 'components'> {
  const isDark = resolved === 'dark';
  const primaryHex = resolveBrandPrimaryHex(resolved, overridePrimaryHex);
  const primaryStates = resolveBrandPrimaryStates(resolved, overridePrimaryHex);

  const token: NonNullable<ThemeConfig['token']> = isDark
    ? {
        colorPrimary: primaryHex,
        /** 主色实心按钮上的文字色。浅色主色配白字会糊，交给主色亮度决定 */
        colorTextLightSolid: readableTextOn(primaryHex),
        /** 表格行内链接操作、Collapse `type="ghost"` 等走 `colorLink`，与主色统一避免偏蓝 */
        colorLink: primaryHex,
        colorLinkHover: primaryStates.hover,
        colorLinkActive: primaryStates.active,
        colorSuccess: '#34d399',
        colorWarning: '#fbbf24',
        colorError: '#f87171',
        colorInfo: '#60a5fa',
        colorBgContainer: '#18181b',
        colorBorder: 'rgba(255,255,255,0.08)',
        colorText: '#fafafa',
        colorTextSecondary: 'rgba(255,255,255,0.7)',
        /** 与正文一致，避免表头偏灰、与 td 字色割裂 */
        colorTextHeading: '#fafafa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
        borderRadius: 6,
      }
    : {
        colorPrimary: primaryHex,
        colorTextLightSolid: readableTextOn(primaryHex),
        colorLink: primaryHex,
        colorLinkHover: primaryStates.hover,
        colorLinkActive: primaryStates.active,
        colorSuccess: '#16a34a',
        colorWarning: '#d97706',
        colorError: '#dc2626',
        colorInfo: '#2563eb',
        colorBgContainer: '#ffffff',
        colorBorder: 'rgba(0,0,0,0.1)',
        colorText: '#18181b',
        colorTextSecondary: 'rgba(0,0,0,0.7)',
        colorTextHeading: '#18181b',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
        borderRadius: 6,
      };

  const components: NonNullable<ThemeConfig['components']> = isDark
    ? {
        Table: {
          headerBg: '#111113',
          headerColor: '#fafafa',
          headerSortActiveBg: '#1f1f23',
          headerSortHoverBg: '#27272a',
          bodySortBg: primaryRgba(primaryHex, 0.08),
          rowHoverBg: '#1f1f23',
          rowSelectedBg: primaryRgba(primaryHex, 0.1),
          rowSelectedHoverBg: primaryRgba(primaryHex, 0.18),
          rowExpandedBg: '#111113',
          borderColor: 'rgba(255,255,255,0.08)',
          headerSplitColor: 'rgba(255,255,255,0.08)',
          footerBg: '#111113',
          footerColor: 'rgba(255,255,255,0.7)',
          cellFontSize: 13,
          cellFontSizeMD: 13,
          cellFontSizeSM: 13,
          filterDropdownMenuBg: '#18181b',
          filterDropdownBg: '#18181b',
          expandIconBg: '#18181b',
        },
        Pagination: {
          itemBg: 'transparent',
          itemActiveBg: primaryRgba(primaryHex, 0.1),
          itemActiveColor: primaryHex,
          itemActiveColorHover: primaryStates.hover,
          itemLinkBg: 'transparent',
          itemInputBg: '#111113',
        },
        Tag: {
          defaultBg: 'rgba(255,255,255,0.04)',
          defaultColor: 'rgba(255,255,255,0.5)',
        },
        /** 多选 / tags 已选项：默认 multipleItemBg 为中性灰，改为主色浅底 */
        Select: {
          multipleItemBg: primaryRgba(primaryHex, 0.12),
          multipleItemBorderColor: primaryRgba(primaryHex, 0.36),
          optionSelectedBg: primaryRgba(primaryHex, 0.12),
          optionSelectedColor: primaryHex,
          optionActiveBg: primaryRgba(primaryHex, 0.08),
          activeBorderColor: primaryHex,
          hoverBorderColor: primaryStates.hover,
        },
        /** 默认（描边）按钮：hover 时边框/字色跟主色，层次更清晰 */
        Button: {
          defaultHoverBg: primaryRgba(primaryHex, 0.08),
          defaultHoverColor: primaryStates.hover,
          defaultHoverBorderColor: primaryStates.hover,
          defaultActiveBg: primaryRgba(primaryHex, 0.12),
          defaultActiveColor: primaryStates.active,
          defaultActiveBorderColor: primaryStates.active,
        },
        Message: {
          contentBg: '#18181b',
          colorText: '#fafafa',
          colorWarning: '#fbbf24',
          colorError: '#f87171',
          colorSuccess: '#34d399',
          colorInfo: '#60a5fa',
        },
      }
    : {
        Table: {
          headerBg: '#f4f4f5',
          headerColor: '#18181b',
          headerSortActiveBg: '#e4e4e7',
          headerSortHoverBg: '#d4d4d8',
          bodySortBg: primaryRgba(primaryHex, 0.08),
          rowHoverBg: '#f0f0f1',
          rowSelectedBg: primaryRgba(primaryHex, 0.1),
          rowSelectedHoverBg: primaryRgba(primaryHex, 0.18),
          rowExpandedBg: '#f4f4f5',
          borderColor: 'rgba(0,0,0,0.1)',
          headerSplitColor: 'rgba(0,0,0,0.1)',
          footerBg: '#f4f4f5',
          footerColor: 'rgba(0,0,0,0.7)',
          cellFontSize: 13,
          cellFontSizeMD: 13,
          cellFontSizeSM: 13,
          filterDropdownMenuBg: '#ffffff',
          filterDropdownBg: '#ffffff',
          expandIconBg: '#ffffff',
        },
        Pagination: {
          itemBg: 'transparent',
          itemActiveBg: primaryRgba(primaryHex, 0.1),
          itemActiveColor: primaryHex,
          itemActiveColorHover: primaryStates.hover,
          itemLinkBg: 'transparent',
          itemInputBg: '#f4f4f5',
        },
        Tag: {
          defaultBg: 'rgba(0,0,0,0.04)',
          defaultColor: 'rgba(0,0,0,0.55)',
        },
        Select: {
          multipleItemBg: primaryRgba(primaryHex, 0.1),
          multipleItemBorderColor: primaryRgba(primaryHex, 0.26),
          optionSelectedBg: primaryRgba(primaryHex, 0.08),
          optionSelectedColor: primaryHex,
          optionActiveBg: primaryRgba(primaryHex, 0.06),
          activeBorderColor: primaryHex,
          hoverBorderColor: primaryStates.hover,
        },
        Button: {
          defaultHoverBg: primaryRgba(primaryHex, 0.06),
          defaultHoverColor: primaryStates.hover,
          defaultHoverBorderColor: primaryStates.hover,
          defaultActiveBg: primaryRgba(primaryHex, 0.1),
          defaultActiveColor: primaryStates.active,
          defaultActiveBorderColor: primaryStates.active,
        },
        Message: {
          contentBg: '#ffffff',
          colorText: '#18181b',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          colorSuccess: '#16a34a',
          colorInfo: '#2563eb',
        },
      };

  return { token, components };
}
