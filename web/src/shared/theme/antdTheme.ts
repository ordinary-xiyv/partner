import { type ThemeConfig } from 'antd';
import { deriveBrandPalette, primaryRgba, type ThemeModeResolved } from './brandTokens';
import { createBrandAlgorithm } from './brandAlgorithm';

/**
 * 与 brandTokens + applyBrandCssVariables 对齐，供 Ant Design 区域主题。
 *
 * `primaryInput` 为租户品牌色（user 端按域名解析得到）。
 * 不传则用平台默认紫（admin 端）。
 *
 * 关于 `algorithm`：
 * 之前只手写 token、不指定算法，等于「浅色算法 + 一堆手动补丁」。
 * 凡是没被显式列出的 token 都会拿到浅色默认值——比如 form 的说明文字
 * colorTextDescription 是 rgba(0,0,0,0.45)，落在 #18181b 的卡片上对比度只有 1.09，
 * 肉眼几乎看不见；Tag 的 success 变体同理（浅绿底 + 浅绿字）。
 * 这里补上 darkAlgorithm 兜底，手写 token 仍然优先，只是把漏配的项自动补齐。
 */
export function buildAntdTheme(resolved: ThemeModeResolved, primaryInput?: string): ThemeConfig {
  const isDark = resolved === 'dark';
  const palette = deriveBrandPalette(resolved, primaryInput);
  const primaryHex = palette.primary;
  const primaryStates = { hover: palette.hover, active: palette.active };

  const token: ThemeConfig['token'] = isDark
    ? {
        colorPrimary: primaryHex,
        /*
         * 主色实心块（primary 按钮 / 选中态 / 徽标）上的文字色。
         *
         * 这一项必须显式给。antd 默认 colorTextLightSolid = #fff，
         * 当经销商选了琥珀(#d97706)、青绿(#0d9488) 这类中亮度色时，
         * 白字对比度只有 3.2~3.7（AA 要求 4.5）。
         * 更糟的是 antd 5.22+ 发现对比度不够后会**自己加深按钮背景**
         * （#d97706 被改成 #bb6808），结果既丢了经销商的精确品牌色，
         * 白字也只有 4.12，仍然不达标——两头都错。
         *
         * 把 readableOnPrimary 的结果喂进来后，antd 就按「黑字配原色」算账，
         * 对比度够了，背景也保持品牌色原样不动。
         */
        colorTextLightSolid: palette.onPrimary,
        // 链接当文字用，必须走已校准明度的 palette.text（见 brandAlgorithm 注释）
        colorLink: palette.text,
        colorLinkHover: primaryStates.hover,
        colorLinkActive: primaryStates.active,
        colorSuccess: '#34d399',
        colorWarning: '#fbbf24',
        colorError: '#f87171',
        colorInfo: '#60a5fa',
        colorBgContainer: '#18181b',
        colorBgElevated: '#18181b',
        colorBorder: 'rgba(255,255,255,0.08)',
        colorBorderSecondary: 'rgba(255,255,255,0.06)',
        colorText: '#fafafa',
        colorTextSecondary: 'rgba(255,255,255,0.7)',
        colorTextHeading: '#fafafa',
        // placeholder / 禁用态默认是浅色主题的黑色半透明，深色下几乎不可见，
        // 会让 Select、DatePicker 的提示文字变成一片空白
        colorTextPlaceholder: 'rgba(255,255,255,0.4)',
        colorTextDisabled: 'rgba(255,255,255,0.28)',
        colorTextQuaternary: 'rgba(255,255,255,0.28)',
        colorIcon: 'rgba(255,255,255,0.45)',
        colorIconHover: 'rgba(255,255,255,0.85)',
        colorBgContainerDisabled: 'rgba(255,255,255,0.04)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
        fontSize: 13,
        borderRadius: 6,
      }
    : {
        colorPrimary: primaryHex,
        colorTextLightSolid: palette.onPrimary,
        // 链接当文字用，必须走已校准明度的 palette.text（见 brandAlgorithm 注释）
        colorLink: palette.text,
        colorLinkHover: primaryStates.hover,
        colorLinkActive: primaryStates.active,
        colorSuccess: '#16a34a',
        colorWarning: '#d97706',
        colorError: '#dc2626',
        colorInfo: '#2563eb',
        colorBgContainer: '#ffffff',
        colorBgElevated: '#ffffff',
        colorBorder: 'rgba(0,0,0,0.1)',
        colorBorderSecondary: 'rgba(0,0,0,0.06)',
        colorText: '#18181b',
        colorTextSecondary: 'rgba(0,0,0,0.7)',
        colorTextHeading: '#18181b',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
        fontSize: 13,
        borderRadius: 6,
      };

  const components: ThemeConfig['components'] = isDark
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
          borderColor: 'rgba(255,255,255,0.08)',
          headerSplitColor: 'rgba(255,255,255,0.08)',
          footerBg: '#111113',
          footerColor: 'rgba(255,255,255,0.7)',
          cellFontSize: 13,
          cellFontSizeMD: 13,
          cellFontSizeSM: 13,
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
        Select: {
          multipleItemBg: primaryRgba(primaryHex, 0.12),
          multipleItemBorderColor: primaryRgba(primaryHex, 0.36),
          optionSelectedBg: primaryRgba(primaryHex, 0.12),
          optionSelectedColor: primaryHex,
          optionActiveBg: primaryRgba(primaryHex, 0.08),
          activeBorderColor: primaryHex,
          hoverBorderColor: primaryStates.hover,
        },
        Button: {
          defaultHoverBg: primaryRgba(primaryHex, 0.08),
          defaultHoverColor: primaryStates.hover,
          defaultHoverBorderColor: primaryStates.hover,
          defaultActiveBg: primaryRgba(primaryHex, 0.12),
          defaultActiveColor: primaryStates.active,
          defaultActiveBorderColor: primaryStates.active,
        },
        Input: {
          activeBorderColor: primaryHex,
          hoverBorderColor: primaryStates.hover,
        },
        Menu: {
          itemBg: 'transparent',
          subMenuItemBg: 'transparent',
          itemSelectedBg: primaryRgba(primaryHex, 0.12),
          itemSelectedColor: primaryHex,
          itemHoverBg: 'rgba(255,255,255,0.04)',
          itemHoverColor: '#fafafa',
          itemColor: 'rgba(255,255,255,0.72)',
        },
        // Segmented 的轨道默认取 colorBgLayout（浅灰），深色下不覆盖会出现
        // 「深色选中块 + 浅灰轨道」的刺眼组合。
        // 轨道色要比页面底(#09090b)明显亮一档，否则整个控件像一块空白的灰板。
        Segmented: {
          trackBg: '#1f1f23',
          itemColor: 'rgba(255,255,255,0.68)',
          itemHoverColor: '#fafafa',
          itemHoverBg: 'rgba(255,255,255,0.08)',
          itemSelectedBg: '#3a3a42',
          itemSelectedColor: '#ffffff',
          trackPadding: 3,
        },
        Card: {
          colorBgContainer: '#18181b',
        },
        Tabs: {
          itemColor: 'rgba(255,255,255,0.65)',
          itemHoverColor: '#fafafa',
          itemSelectedColor: '#fafafa',
          inkBarColor: primaryHex,
        },
        Message: {
          contentBg: '#18181b',
          colorText: '#fafafa',
        },
        Modal: {
          contentBg: '#18181b',
          headerBg: '#18181b',
        },
        Drawer: {
          colorBgElevated: '#18181b',
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
          borderColor: 'rgba(0,0,0,0.08)',
          headerSplitColor: 'rgba(0,0,0,0.08)',
          footerBg: '#f4f4f5',
          footerColor: 'rgba(0,0,0,0.7)',
          cellFontSize: 13,
          cellFontSizeMD: 13,
          cellFontSizeSM: 13,
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
          multipleItemBorderColor: primaryRgba(primaryHex, 0.3),
          optionSelectedBg: primaryRgba(primaryHex, 0.1),
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
        Input: {
          activeBorderColor: primaryHex,
          hoverBorderColor: primaryStates.hover,
        },
        Menu: {
          itemBg: 'transparent',
          subMenuItemBg: 'transparent',
          itemSelectedBg: primaryRgba(primaryHex, 0.1),
          itemSelectedColor: primaryHex,
          itemHoverBg: 'rgba(0,0,0,0.03)',
          itemHoverColor: '#18181b',
          itemColor: 'rgba(0,0,0,0.7)',
        },
        Segmented: {
          trackBg: '#f4f4f5',
          itemColor: 'rgba(0,0,0,0.65)',
          itemHoverColor: '#18181b',
          itemHoverBg: 'rgba(0,0,0,0.04)',
          itemSelectedBg: '#ffffff',
          itemSelectedColor: '#18181b',
          trackPadding: 3,
        },
        Card: {
          colorBgContainer: '#ffffff',
        },
        Tabs: {
          itemColor: 'rgba(0,0,0,0.65)',
          itemHoverColor: '#18181b',
          itemSelectedColor: '#18181b',
          inkBarColor: primaryHex,
        },
        Message: {
          contentBg: '#ffffff',
          colorText: '#18181b',
        },
        Modal: {
          contentBg: '#ffffff',
          headerBg: '#ffffff',
        },
        Drawer: {
          colorBgElevated: '#ffffff',
        },
      };

  return { algorithm: createBrandAlgorithm(resolved, primaryInput), token, components };
}
