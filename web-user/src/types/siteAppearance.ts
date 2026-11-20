/** 站点外观配置 — 与 internal/sitebranding/appearance_types.go 对齐 */

import type { LocaleLabels } from '../utils/localeLabels';

export interface SiteLayoutConfig {
  show_theme_switcher: boolean;
  show_language_switcher: boolean;
  locale_extras?: SiteLocaleExtras;
}

export interface SiteLocaleExtras {
  brand_names?: LocaleLabels;
  terms_labels?: LocaleLabels;
  privacy_labels?: LocaleLabels;
  copyright_labels?: LocaleLabels;
}

export interface HeaderNavDropdownItemConfig {
  id: string;
  label_zh: string;
  label_en: string;
  labels?: LocaleLabels;
  href: string;
  visible: boolean;
  sort: number;
}

export interface HeaderNavItemConfig {
  id: string;
  label_zh: string;
  label_en: string;
  labels?: LocaleLabels;
  type: 'internal' | 'external' | 'dropdown';
  path?: string;
  href?: string;
  visible: boolean;
  sort: number;
  dropdown_items?: HeaderNavDropdownItemConfig[];
}

export interface FooterColumnLinkConfig {
  id: string;
  label_zh: string;
  label_en: string;
  labels?: LocaleLabels;
  type: 'internal' | 'external';
  path?: string;
  href?: string;
  visible: boolean;
  sort: number;
}

export interface FooterColumnConfig {
  id: string;
  title_zh: string;
  title_en: string;
  title_labels?: LocaleLabels;
  visible: boolean;
  sort: number;
  links: FooterColumnLinkConfig[];
}

export interface MarketingBannerConfig {
  enabled: boolean;
  static_ad: boolean;
  background_image_file_id: string;
  background_image_url?: string;
  link_url: string;
  start_at: number;
  end_at: number;
}

/** 登录页媒体类型：none 不展示（左面板纯白） */
export type LoginMediaType = 'none' | 'image' | 'video';

export interface LoginMediaConfig {
  type: LoginMediaType;
  image_file_id: string;
  image_url?: string;
  video_file_id: string;
  video_url?: string;
  poster_file_id: string;
  poster_url?: string;
}

export interface CustomerServiceConfig {
  enabled: boolean;
  show_contact: boolean;
  show_feedback: boolean;
  qr_code_file_id: string;
  qr_code_url?: string;
  feedback_url: string;
}

export interface FooterSocialLink {
  visible: boolean;
  url: string;
}

export interface FooterQrItem {
  visible: boolean;
  file_id: string;
  url?: string;
}

/** 首页页脚「联系我们」整块：显隐 + 电话 + 地址（空值前台回退 i18n） */
export interface FooterContactConfig {
  visible: boolean;
  /** 联系电话，不参与多语言（号码全球一致）；空则回退 i18n */
  phone: string;
  /** 简体中文地址，支持 \n 换行 */
  address_zh: string;
  /** 英文地址，支持 \n 换行 */
  address_en: string;
  /** 地址多语言（zh-CN/en 为 address_zh/address_en 的别名） */
  address_labels?: LocaleLabels;
}

export interface FooterBrandConfig {
  slogan_zh: string;
  slogan_en: string;
  slogan_labels?: LocaleLabels;
  xiaohongshu: FooterSocialLink;
  bilibili: FooterSocialLink;
  official_qr: FooterQrItem;
  expert_qr: FooterQrItem;
  contact: FooterContactConfig;
}

export interface SiteAppearance {
  brand_name_zh: string;
  brand_name_en: string;
  brand_names?: LocaleLabels;
  copyright_text?: string;
  copyright_labels?: LocaleLabels;
  terms_label?: string;
  terms_labels?: LocaleLabels;
  privacy_label?: string;
  privacy_labels?: LocaleLabels;
  beian_label?: string;
  header_config: { enabled: boolean; items: HeaderNavItemConfig[] };
  footer_columns_config: { enabled: boolean; columns: FooterColumnConfig[] };
  footer_copyright_config: { enabled: boolean };
  footer_brand_config: FooterBrandConfig;
  layout_config: SiteLayoutConfig;
  marketing_banner_config: MarketingBannerConfig;
  customer_service_config: CustomerServiceConfig;
  login_media_config: LoginMediaConfig;
}

export type SiteAppearancePutBody = SiteAppearance;
