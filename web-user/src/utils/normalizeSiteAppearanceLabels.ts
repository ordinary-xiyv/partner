import type { SiteAppearance } from '../types/siteAppearance';
import type { LocaleLabels } from './localeLabels';
import {
  mergeLegacyIntoLabels,
  normalizeFooterColumnLabels,
  normalizeNavItemLabels,
  syncLegacyFromLabels,
} from './localeLabels';
import { normalizeSiteAppearanceDocs } from './normalizeSiteAppearanceDocs';
import { normalizeFooterBrandConfig, normalizeFooterContactConfig } from '../config/defaultFooterBrand';

function mergeLabelSources(
  primary?: LocaleLabels,
  extras?: LocaleLabels,
  legacyZh?: string,
  legacyEn?: string,
): LocaleLabels {
  const merged = mergeLegacyIntoLabels(primary, legacyZh, legacyEn);
  if (!extras) return merged;
  const out: LocaleLabels = { ...merged };
  (['en', 'th', 'vi', 'ms'] as const).forEach((code) => {
    if (!out[code]?.trim() && extras[code]?.trim()) {
      out[code] = extras[code]!.trim();
    }
  });
  return out;
}

/** Normalize appearance labels from API/localStorage/legacy zh-en fields. */
export function normalizeSiteAppearanceLabels(appearance: SiteAppearance): SiteAppearance {
  const extras = appearance.layout_config?.locale_extras;

  const brandNames = mergeLabelSources(
    appearance.brand_names,
    extras?.brand_names,
    appearance.brand_name_zh,
    appearance.brand_name_en,
  );
  const brandLegacy = syncLegacyFromLabels(brandNames);

  const termsLabels = mergeLabelSources(appearance.terms_labels, extras?.terms_labels, appearance.terms_label);
  const privacyLabels = mergeLabelSources(appearance.privacy_labels, extras?.privacy_labels, appearance.privacy_label);
  const copyrightLabels = mergeLabelSources(
    appearance.copyright_labels,
    extras?.copyright_labels,
    appearance.copyright_text,
  );

  const sloganLabels = mergeLabelSources(
    appearance.footer_brand_config?.slogan_labels,
    undefined,
    appearance.footer_brand_config?.slogan_zh,
    appearance.footer_brand_config?.slogan_en,
  );
  const sloganLegacy = syncLegacyFromLabels(sloganLabels);

  // 联系区地址：address_labels 为准，address_zh/address_en 同步为 zh-CN/en 别名
  const contactRaw = appearance.footer_brand_config?.contact;
  const addressLabels = mergeLabelSources(
    contactRaw?.address_labels,
    undefined,
    contactRaw?.address_zh,
    contactRaw?.address_en,
  );
  const addressLegacy = syncLegacyFromLabels(addressLabels);

  return {
    ...appearance,
    brand_names: brandNames,
    brand_name_zh: brandLegacy.label_zh,
    brand_name_en: brandLegacy.label_en,
    terms_labels: termsLabels,
    terms_label: termsLabels['zh-CN'] ?? appearance.terms_label,
    privacy_labels: privacyLabels,
    privacy_label: privacyLabels['zh-CN'] ?? appearance.privacy_label,
    copyright_labels: copyrightLabels,
    copyright_text: copyrightLabels['zh-CN'] ?? appearance.copyright_text,
    footer_brand_config: {
      ...normalizeFooterBrandConfig(appearance.footer_brand_config),
      slogan_labels: sloganLabels,
      slogan_zh: sloganLegacy.label_zh,
      slogan_en: sloganLegacy.label_en,
      contact: {
        ...normalizeFooterContactConfig(contactRaw),
        address_labels: addressLabels,
        address_zh: addressLegacy.label_zh,
        address_en: addressLegacy.label_en,
      },
    },
    header_config: {
      ...appearance.header_config,
      items: appearance.header_config.items.map((item) =>
        normalizeNavItemLabels({
          ...item,
          dropdown_items: item.dropdown_items?.map((child) => normalizeNavItemLabels(child)),
        }),
      ),
    },
    footer_columns_config: {
      ...appearance.footer_columns_config,
      columns: appearance.footer_columns_config.columns.map((col) =>
        normalizeFooterColumnLabels({
          ...col,
          links: col.links.map((link) => normalizeNavItemLabels(link)),
        }),
      ),
    },
    layout_config: {
      ...appearance.layout_config,
      locale_extras: undefined,
    },
  };
}

export function buildLocaleExtrasForSave(
  appearance: SiteAppearance,
): SiteAppearance['layout_config']['locale_extras'] {
  const pickOptional = (labels?: LocaleLabels) => {
    if (!labels) return undefined;
    const out: LocaleLabels = {};
    (['en', 'th', 'vi', 'ms'] as const).forEach((code) => {
      const value = labels[code]?.trim();
      if (value) out[code] = value;
    });
    return Object.keys(out).length ? out : undefined;
  };

  const localeExtras = {
    brand_names: pickOptional(appearance.brand_names),
    copyright_labels: pickOptional(appearance.copyright_labels),
  };

  if (
    !localeExtras.brand_names
    && !localeExtras.copyright_labels
  ) {
    return undefined;
  }
  return localeExtras;
}

export function prepareSiteAppearanceForSave(appearance: SiteAppearance): SiteAppearance {
  const normalized = normalizeSiteAppearanceLabels(normalizeSiteAppearanceDocs(appearance));
  return {
    ...normalized,
    layout_config: {
      ...normalized.layout_config,
      locale_extras: buildLocaleExtrasForSave(normalized),
    },
  };
}
