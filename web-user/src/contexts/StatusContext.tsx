import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getStatus, getLynxConfig, getPublicSiteFooter, getPublicSiteLogosThemed, getPublicSiteFavicons, getPublicSiteAppearance } from '../api';
import { setCurrencyGlobal } from '../utils';
import type { StatusInfo, LynxSiteFooterConfig, LynxSiteLogoPublic, SiteLogosThemed } from '../types';
import type { SiteAppearance } from '../types/siteAppearance';
import { applySiteBrandInterpolation, syncDocumentTitleFromBrand } from '../i18n/siteBrandInterpolation';
import { applySiteFavicon, resolveSiteFaviconUrl } from '../utils/siteFavicon';
import {
  readStoredSiteBrand,
  SITE_BRAND_CHANGED_EVENT,
  type StoredSiteBrand,
} from '../utils/siteBrandStorage';
import {
  readStoredSiteAppearance,
  SITE_APPEARANCE_CHANGED_EVENT,
} from '../utils/siteAppearanceStorage';
import { buildDefaultSiteAppearance } from '../config/defaultSiteAppearance';
import { mergeSiteAppearance } from '../utils/mergeSiteAppearance';
import i18n from '../i18n';
import { getDocsHomeUrl, resolveDocLang } from '../config/docs';

interface LynxConfig {
  deployment_region: 'cn' | 'global';
  currency_symbol: string;
  currency_rate: number;
}

interface StatusContextType {
  status: StatusInfo | null;
  lynxConfig: LynxConfig;
  siteFooter: LynxSiteFooterConfig | null;
  siteAppearance: SiteAppearance;
  siteLogosThemed: SiteLogosThemed;
  siteFavicons: LynxSiteLogoPublic[];
  siteBrand: StoredSiteBrand;
  loading: boolean;
  refresh: () => Promise<StatusInfo | null>;
}

const DEFAULT_LYNX_CONFIG: LynxConfig = {
  deployment_region: 'cn',
  currency_symbol: '¥',
  currency_rate: 1,
};

function buildAppearanceDefaults(): SiteAppearance {
  const lang = resolveDocLang(i18n.language);
  return buildDefaultSiteAppearance(i18n.t.bind(i18n), getDocsHomeUrl(lang));
}

function appearanceToFooter(appearance: SiteAppearance): LynxSiteFooterConfig {
  return {
    copyright_text: appearance.copyright_text,
    terms_label: appearance.terms_label,
    privacy_label: appearance.privacy_label,
    beian_label: appearance.beian_label,
  };
}

function syncBrandFromAppearance(appearance: SiteAppearance, setSiteBrand: (v: StoredSiteBrand) => void) {
  const brand: StoredSiteBrand = {
    brand_name_zh: appearance.brand_name_zh,
    brand_name_en: appearance.brand_name_en,
  };
  setSiteBrand(brand);
  applySiteBrandInterpolation(brand.brand_name_zh, brand.brand_name_en);
  syncDocumentTitleFromBrand();
}

const StatusContext = createContext<StatusContextType>({
  status: null,
  lynxConfig: DEFAULT_LYNX_CONFIG,
  siteFooter: null,
  siteAppearance: buildAppearanceDefaults(),
  siteLogosThemed: { light: null, dark: null },
  siteFavicons: [],
  siteBrand: readStoredSiteBrand(),
  loading: true,
  refresh: async () => null,
});

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [lynxConfig, setLynxConfig] = useState<LynxConfig>(DEFAULT_LYNX_CONFIG);
  const [siteFooter, setSiteFooter] = useState<LynxSiteFooterConfig | null>(null);
  const [siteAppearance, setSiteAppearance] = useState<SiteAppearance>(() => {
    const defaults = buildAppearanceDefaults();
    return mergeSiteAppearance(defaults, { local: readStoredSiteAppearance() });
  });
  const [siteLogosThemed, setSiteLogosThemed] = useState<SiteLogosThemed>({ light: null, dark: null });
  const [siteFavicons, setSiteFavicons] = useState<LynxSiteLogoPublic[]>([]);
  const [siteBrand, setSiteBrand] = useState<StoredSiteBrand>(() => readStoredSiteBrand());
  const [loading, setLoading] = useState(true);

  const applyAppearance = useCallback((appearance: SiteAppearance) => {
    setSiteAppearance(appearance);
    setSiteFooter(appearanceToFooter(appearance));
    syncBrandFromAppearance(appearance, setSiteBrand);
  }, []);

  useEffect(() => {
    const defaults = buildAppearanceDefaults();
    const local = readStoredSiteAppearance();
    if (local) {
      applyAppearance(mergeSiteAppearance(defaults, { local }));
    } else {
      syncBrandFromAppearance(mergeSiteAppearance(defaults, {}), setSiteBrand);
    }

    const onBrandChanged = () => {
      const brand = readStoredSiteBrand();
      setSiteBrand(brand);
      applySiteBrandInterpolation(brand.brand_name_zh, brand.brand_name_en);
      syncDocumentTitleFromBrand();
    };
    const onAppearanceChanged = () => {
      const defaultsNext = buildAppearanceDefaults();
      applyAppearance(mergeSiteAppearance(defaultsNext, { local: readStoredSiteAppearance() }));
    };

    window.addEventListener(SITE_BRAND_CHANGED_EVENT, onBrandChanged);
    window.addEventListener(SITE_APPEARANCE_CHANGED_EVENT, onAppearanceChanged);
    return () => {
      window.removeEventListener(SITE_BRAND_CHANGED_EVENT, onBrandChanged);
      window.removeEventListener(SITE_APPEARANCE_CHANGED_EVENT, onAppearanceChanged);
    };
  }, [applyAppearance]);

  const fetchAll = useCallback(async (): Promise<StatusInfo | null> => {
    let result: StatusInfo | null = null;
    const defaults = buildAppearanceDefaults();
    try {
      const [statusRes, configRes, footerRes, appearanceRes, logosThemedRes, faviconsRes] = await Promise.all([
        getStatus().catch(() => null),
        getLynxConfig().catch(() => null),
        getPublicSiteFooter().catch(() => null),
        getPublicSiteAppearance().catch(() => null),
        getPublicSiteLogosThemed().catch(() => null),
        getPublicSiteFavicons({ limit: 3 }).catch(() => null),
      ]);
      if (statusRes?.data?.success) {
        result = statusRes.data.data;
        setStatus(result);
      }
      if (configRes?.data?.success && configRes.data.data) {
        const cfg = configRes.data.data;
        const symbol = cfg.currency_symbol || '¥';
        const rate = cfg.currency_rate ?? 1;
        setLynxConfig({
          deployment_region: cfg.deployment_region || 'cn',
          currency_symbol: symbol,
          currency_rate: rate,
        });
        setCurrencyGlobal(symbol, rate);
      }

      const footer = footerRes?.data?.success && footerRes.data.data && typeof footerRes.data.data === 'object'
        ? footerRes.data.data as LynxSiteFooterConfig
        : null;
      const apiAppearance = appearanceRes?.data?.success && appearanceRes.data.data
        ? appearanceRes.data.data as SiteAppearance
        : null;

      const merged = mergeSiteAppearance(defaults, {
        api: apiAppearance,
        footer,
        local: readStoredSiteAppearance(),
      });
      applyAppearance(merged);

      if (logosThemedRes?.data?.success && logosThemedRes.data.data) {
        const data = logosThemedRes.data.data;
        setSiteLogosThemed({
          light: data.light ?? null,
          dark: data.dark ?? null,
        });
      } else {
        setSiteLogosThemed({ light: null, dark: null });
      }

      let nextFavicons: LynxSiteLogoPublic[] = [];
      if (faviconsRes?.data?.success && Array.isArray(faviconsRes.data.data)) {
        nextFavicons = faviconsRes.data.data as LynxSiteLogoPublic[];
        setSiteFavicons(nextFavicons);
      } else {
        setSiteFavicons([]);
      }
      const faviconResolved = resolveSiteFaviconUrl(nextFavicons);
      applySiteFavicon(faviconResolved.url, faviconResolved.contentType);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
    return result;
  }, [applyAppearance]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchAll();
    }, 8 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [fetchAll]);

  const contextValue = useMemo(
    () => ({
      status,
      lynxConfig,
      siteFooter,
      siteAppearance,
      siteLogosThemed,
      siteFavicons,
      siteBrand,
      loading,
      refresh: fetchAll,
    }),
    [status, lynxConfig, siteFooter, siteAppearance, siteLogosThemed, siteFavicons, siteBrand, loading, fetchAll],
  );

  return (
    <StatusContext.Provider value={contextValue}>
      {children}
    </StatusContext.Provider>
  );
}

export const useStatus = () => useContext(StatusContext);

export function useQuotaPerUnit(): number {
  const { status } = useStatus();
  return status?.quota_per_unit || 500000;
}

export function useCurrencySymbol(): string {
  const { lynxConfig } = useStatus();
  return lynxConfig.currency_symbol;
}
