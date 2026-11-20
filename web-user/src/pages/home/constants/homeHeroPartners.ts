import {
  HOME_PARTNER_MARQUEE_ROWS,
  resolveHomePartnerLogoSrc,
  type HomePartnerLogoItem,
} from './partnerMarquee';

/** 首页 Hero 轨道：去重后的合作商列表（顺序与跑马灯配置一致） */
export function flattenHomeHeroPartners(): HomePartnerLogoItem[] {
  const seen = new Set<string>();
  const result: HomePartnerLogoItem[] = [];

  for (const row of HOME_PARTNER_MARQUEE_ROWS) {
    for (const item of row.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
  }

  return result;
}

export function resolveHomeHeroPartnerLogo(item: HomePartnerLogoItem): string {
  return resolveHomePartnerLogoSrc(item.logoFile);
}
