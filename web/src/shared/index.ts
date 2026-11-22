// 样式
import './styles/index.css';

// 主题
export { ThemeProvider, useTheme } from './theme/ThemeProvider';
export { buildAntdTheme } from './theme/antdTheme';
export { createBrandAlgorithm } from './theme/brandAlgorithm';
export {
  BRAND_PRIMARY_HEX,
  BRAND_PRIMARY_STATES,
  applyBrandCssVariables,
  primaryRgba,
  deriveBrandPalette,
  normalizeHex,
  readableOnPrimary,
  relativeLuminance,
  type BrandPalette,
  type ThemeModeResolved,
} from './theme/brandTokens';

// 白标（品牌展示组件）
export { BrandLogo } from './ui/BrandLogo';
export { BrandPreview } from './ui/BrandPreview';
export { HomeStylePicker } from './ui/HomeStylePicker';

// 请求层
export {
  http,
  request,
  fillPath,
  getToken,
  setToken,
  clearToken,
  onUnauthorized,
  USE_MOCK,
  ApiNotReadyError,
  type ApiEnvelope,
  type ListResult,
} from './api/http';
export { EP } from './api/endpoints';

// API 命名空间：页面统一用 dealerApi.xxx()
export * as dealerApi from './api/dealer';

/*
 * 少数几个类型要单独具名导出：它们既被 dealerApi 里的函数用到，又要被页面
 * 当成类型标注直接写（dealerApi.BrandImageTarget 在类型位置上不可读）。
 */
export type { BrandImageTarget } from './api/dealer';

// 认证
export { createAuthContext, FullPageLoading } from './auth/createAuthContext';

// 布局
export { AppShell, buildAccountMenu, type NavItem, type NavGroup } from './layout/AppShell';
export { LoginLayout } from './layout/LoginLayout';

// UI
export { AppPageHeader, AppEmpty } from './ui/appLayout';
export { PagePanel, PageStack } from './ui/PagePanel';
export { AsyncTableCard } from './ui/AsyncTableCard';
export { StatCard, BarChart, RankList, DescGrid } from './ui/Stats';
export { UseMockNotice } from './ui/UseMockNotice';

// 工具
export * from './utils/format';

// 通知
export { notify, notifyApiSuccess, notifyApiError, extractErrorMessage } from './lib/notify';

// 首页风格（伙伴后台选择，客户站渲染）
export {
  HOME_STYLE_EDITORIAL,
  HOME_STYLE_TERMINAL,
  DEFAULT_HOME_STYLE,
  parseHomeStyle,
  type HomeStyle,
} from './lib/homeStyle';

// 类型
export type * from './types/dealer';
export type * from './types/tenant';
