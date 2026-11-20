import type {
  FooterBrandConfig,
  FooterContactConfig,
  FooterQrItem,
  FooterSocialLink,
} from '../types/siteAppearance';
import type { LocaleLabels } from '../utils/localeLabels';

export function buildDefaultFooterSocialLink(): FooterSocialLink {
  return {
    visible: true,
    url: '',
  };
}

export function buildDefaultFooterQrItem(): FooterQrItem {
  return {
    visible: true,
    file_id: '',
  };
}

/** 联系区默认：整块显示，电话/地址留空（前台回退 i18n 默认文案） */
export function buildDefaultFooterContactConfig(): FooterContactConfig {
  return {
    visible: true,
    phone: '',
    address_zh: '',
    address_en: '',
  };
}

/** 第二套首页页脚品牌区默认：Slogan 空（前台回退 i18n），社交/二维码默认显示 */
export function buildDefaultFooterBrandConfig(): FooterBrandConfig {
  return {
    slogan_zh: '',
    slogan_en: '',
    xiaohongshu: buildDefaultFooterSocialLink(),
    bilibili: buildDefaultFooterSocialLink(),
    official_qr: buildDefaultFooterQrItem(),
    expert_qr: buildDefaultFooterQrItem(),
    contact: buildDefaultFooterContactConfig(),
  };
}

export function normalizeFooterSocialLink(
  raw: Partial<FooterSocialLink> | undefined,
): FooterSocialLink {
  const base = buildDefaultFooterSocialLink();
  if (!raw) return base;
  return {
    visible: raw.visible ?? base.visible,
    url: raw.url?.trim() || '',
  };
}

export function normalizeFooterQrItem(
  raw: Partial<FooterQrItem> | undefined,
): FooterQrItem {
  const base = buildDefaultFooterQrItem();
  if (!raw) return base;
  return {
    visible: raw.visible ?? base.visible,
    file_id: raw.file_id?.trim() || '',
    url: raw.url,
  };
}

/**
 * 联系区归一化。visible 缺省为 true（老数据没有该字段时不能整块消失）。
 * 地址：address_labels 为准，address_zh/address_en 作别名回填。
 */
export function normalizeFooterContactConfig(
  raw: Partial<FooterContactConfig> | undefined,
): FooterContactConfig {
  const base = buildDefaultFooterContactConfig();
  if (!raw) return base;
  const labels: LocaleLabels = { ...(raw.address_labels ?? {}) };
  if (raw.address_zh?.trim() && !labels['zh-CN']?.trim()) labels['zh-CN'] = raw.address_zh.trim();
  if (raw.address_en?.trim() && !labels.en?.trim()) labels.en = raw.address_en.trim();
  return {
    visible: raw.visible ?? base.visible,
    phone: raw.phone?.trim() || '',
    address_zh: labels['zh-CN'] ?? '',
    address_en: labels.en ?? '',
    address_labels: labels,
  };
}

export function normalizeFooterBrandConfig(
  raw: Partial<FooterBrandConfig> | undefined,
): FooterBrandConfig {
  const base = buildDefaultFooterBrandConfig();
  if (!raw) return base;
  return {
    slogan_zh: raw.slogan_zh?.trim() || '',
    slogan_en: raw.slogan_en?.trim() || '',
    slogan_labels: raw.slogan_labels,
    xiaohongshu: normalizeFooterSocialLink(raw.xiaohongshu),
    bilibili: normalizeFooterSocialLink(raw.bilibili),
    official_qr: normalizeFooterQrItem(raw.official_qr),
    expert_qr: normalizeFooterQrItem(raw.expert_qr),
    contact: normalizeFooterContactConfig(raw.contact),
  };
}
