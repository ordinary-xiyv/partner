import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import {
  resolvePartnerFavicon,
  resolvePartnerPageTitle,
  resolvePartnerPrimaryColor,
} from '../utils/partnerBrand';
import { setBrandPageTitleOverride, setBrandPrimaryColorOverride } from '../theme/brandOverride';
import i18n from '../i18n';
import { getDocsHomeUrl, resolveDocLang } from '../config/docs';
import { usePartnerSiteBrand, type PartnerSiteBrand } from '../hooks/usePartnerSiteBrand';
import { setDocBaseUrlOverride, setDocBrandNameOverride } from '../features/doccenter/doccenterService';

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
  /**
   * 伙伴后台下发的品牌（按站点身份读取）。
   *
   * 单独暴露出来，是因为它只覆盖「8 个核心字段 + 客服」，
   * 而页面里有些地方需要知道「这个值到底来自伙伴还是平台」——
   * 比如 logo：伙伴配了就用它，没配要继续用平台那套亮/暗双版。
   * 都塞进 siteAppearance 就分不出来了。
   */
  partnerBrand: PartnerSiteBrand | null;
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

/**
 * 合并用的「平台侧来源」快照。
 *
 * 单独抽一个类型，是因为这几个值需要在 ref 里留一份 —— 见下面
 * appearanceSourcesRef 的注释。
 */
interface AppearanceSources {
  api: Partial<SiteAppearance> | null;
  footer: LynxSiteFooterConfig | null;
  local: SiteAppearance | null;
}

/**
 * 从外部拉到的东西算一遍外观。
 *
 * 注意合并结果不等于「最终展示值」：这里只算平台侧 + 伙伴侧，
 * 渲染时页面还会再按需挑（例如 logo 优先用伙伴的，没配才用平台的亮/暗双版）。
 */
function mergeWithPartner(defaults: SiteAppearance, sources: AppearanceSources, partner: PartnerSiteBrand | null): SiteAppearance {
  return mergeSiteAppearance(defaults, { ...sources, partner });
}

const StatusContext = createContext<StatusContextType>({
  status: null,
  lynxConfig: DEFAULT_LYNX_CONFIG,
  siteFooter: null,
  siteAppearance: buildAppearanceDefaults(),
  siteLogosThemed: { light: null, dark: null },
  siteFavicons: [],
  siteBrand: readStoredSiteBrand(),
  partnerBrand: null,
  loading: true,
  refresh: async () => null,
});

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [lynxConfig, setLynxConfig] = useState<LynxConfig>(DEFAULT_LYNX_CONFIG);
  const [siteFooter, setSiteFooter] = useState<LynxSiteFooterConfig | null>(null);
  /*
   * 伙伴品牌：独立取一次，和平台配置并行。
   *
   * 不塞进下面那个 Promise.all 里，是因为两者的失败语义不同 ——
   * 平台配置拿不到是「网站有问题」，伙伴品牌拿不到只是「这个站点没有白标」，
   * 后者应该静默降级而不是让整个 fetchAll 走进 catch。
   */
  const { brand: partnerBrand } = usePartnerSiteBrand();
  /**
   * 伙伴品牌的最新值（ref 版）。
   *
   * 给 fetchAll 这类「不在渲染路径上、且会被定时器复用」的函数用：
   * 它捕获的是首次渲染的闭包，直接读 partnerBrand 会永远是 null。
   */
  const partnerBrandRef = useRef<PartnerSiteBrand | null>(null);
  partnerBrandRef.current = partnerBrand;
  const [siteAppearance, setSiteAppearance] = useState<SiteAppearance>(() => {
    const defaults = buildAppearanceDefaults();
    return mergeSiteAppearance(defaults, { local: readStoredSiteAppearance() });
  });
  const [siteLogosThemed, setSiteLogosThemed] = useState<SiteLogosThemed>({ light: null, dark: null });
  const [siteFavicons, setSiteFavicons] = useState<LynxSiteLogoPublic[]>([]);
  const [siteBrand, setSiteBrand] = useState<StoredSiteBrand>(() => readStoredSiteBrand());
  const [loading, setLoading] = useState(true);

  /**
   * 最近一次从平台侧拉到的来源快照。
   *
   * 为什么要留一份：伙伴品牌和平台配置是两个并行请求，谁先回来不一定。
   * 如果伙伴品牌回来得晚，此时手上只有「初始的 localStorage」，
   * 拿它重新合并会把已经拉到的平台配置扔掉 —— 表现为品牌名闪回平台默认值。
   * 所以这里存住最后一次的平台来源，伙伴品牌一变就用它重算。
   */
  const appearanceSourcesRef = useRef<AppearanceSources>({
    api: null,
    footer: null,
    local: readStoredSiteAppearance(),
  });

  const applyAppearance = useCallback((appearance: SiteAppearance) => {
    setSiteAppearance(appearance);
    setSiteFooter(appearanceToFooter(appearance));
    syncBrandFromAppearance(appearance, setSiteBrand);
  }, []);

  /**
   * 唯一的「重算外观」入口。
   *
   * 为什么要有这么一个函数：外观由两路数据合成 —— 平台侧（6 个接口，
   * 走 fetchAll）和伙伴侧（1 个接口，走 usePartnerSiteBrand）。两者并行发起，
   * 到达顺序不确定。如果各自合并完就 setState，晚到的那次会用「自己看到的
   * 另一半」覆盖前面的结果，表现为品牌名/客服配置随机丢一半。
   *
   * 所以统一约定：任何一侧数据变化时，先更新对应的 ref，再调这个函数。
   * 它总是读**两个 ref 的最新值**来算，与到达顺序无关。
   */
  const recomputeAppearance = useCallback(() => {
    const defaults = buildAppearanceDefaults();
    const merged = mergeWithPartner(
      defaults,
      appearanceSourcesRef.current,
      partnerBrandRef.current,
    );
    applyAppearance(merged);

    /*
     * 主色 / 标题 / favicon 也在这里一次性同步。
     *
     * 它们不放进 siteAppearance：主色属于主题层（要重刷整套 CSS 变量 +
     * antd 的算法 token），标题是浏览器的，favicon 是 <link> 标签 ——
     * 都不是「页面内容」，塞进去会让合并函数变成什么都干的大杂烩。
     */
    const partner = partnerBrandRef.current;
    setBrandPrimaryColorOverride(resolvePartnerPrimaryColor(partner?.primary_color));
    setBrandPageTitleOverride(resolvePartnerPageTitle(partner));
    // 放在 syncBrandFromAppearance 之后：那次调用用的是设置前的旧标题
    syncDocumentTitleFromBrand();

    /*
     * favicon：伙伴配了就用伙伴的，否则回退平台的。
     *
     * 平台侧是列表（取前 3 条挑第一条），伙伴侧只有一个 favicon_url ——
     * 后者是「这个商户明确指定要用这张」，优先级高于平台运营配的那套。
     * 伙伴没配时不动：平台那套已由 resolveSiteFaviconUrl 应用过，
     * 这里再调 applySiteFavicon(undefined) 反而会把平台图标清掉。
     */
    const partnerFavicon = resolvePartnerFavicon(partner);
    if (partnerFavicon) {
      applySiteFavicon(partnerFavicon);
    }

    /*
     * 接口基地址 + 品牌名：注入给文档服务。
     *
     * 两者的用途不同，别混：
     *
     *   · baseUrl   —— 文档正文里 {{baseUrl}} 的替换结果，也用于「环境」表格。
     *   · brandName —— 文档正文里 {{brandName}} 的替换结果。
     *
     * 伙伴文档是伙伴后端返回的**原始 Markdown**（不做服务端替换），
     * 所以这两个占位符必须在客户站这边补。主站链路是后端已经替换过的，
     * 补这一步是空操作（正文里没有 {{...}} 了），不会重复替换。
     *
     * 品牌名用伙伴后台填的 name（PublicSiteBrand 里没有分语种的品牌名，
     * 只有一个 name 和 short_name）。short_name 是缩写，不适合出现在
     * 「某某提供」这种完整句式里，所以只在 name 缺失时才退到它。
     * 都取不到就传空 —— 宁可让 {{brandName}} 渲染成空，也不能冒充主站名。
     */
    setDocBaseUrlOverride(partner?.api_base_url);
    setDocBrandNameOverride(
      (partner?.name || '').trim() || (partner?.short_name || '').trim(),
    );
  }, [applyAppearance]);

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
      /*
       * 本地外观被改（运营在同一个浏览器里调过样式）→ 更新来源快照后重算。
       * 不直接合并 defaults + local：那样会把伙伴品牌和平台 API 的配置丢掉。
       */
      appearanceSourcesRef.current = {
        ...appearanceSourcesRef.current,
        local: readStoredSiteAppearance(),
      };
      recomputeAppearance();
    };

    window.addEventListener(SITE_BRAND_CHANGED_EVENT, onBrandChanged);
    window.addEventListener(SITE_APPEARANCE_CHANGED_EVENT, onAppearanceChanged);
    return () => {
      window.removeEventListener(SITE_BRAND_CHANGED_EVENT, onBrandChanged);
      window.removeEventListener(SITE_APPEARANCE_CHANGED_EVENT, onAppearanceChanged);
    };
  }, [applyAppearance, recomputeAppearance]);

  const fetchAll = useCallback(async (): Promise<StatusInfo | null> => {
    let result: StatusInfo | null = null;
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

      /*
       * 存住这次的平台来源，再统一重算。
       * 读 ref 而不是闭包里的 partnerBrand：fetchAll 每 8 分钟被调一次，
       * 闭包捕获的是首次渲染时的 partnerBrand（永远是 null）。
       */
      appearanceSourcesRef.current = {
        api: apiAppearance,
        footer,
        local: readStoredSiteAppearance(),
      };

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

      /*
       * 平台 favicon 先应用，再由 recomputeAppearance 决定要不要用伙伴的覆盖。
       * 顺序不能反：先应用伙伴的会被这里的平台值盖掉。
       */
      const faviconResolved = resolveSiteFaviconUrl(nextFavicons);
      applySiteFavicon(faviconResolved.url, faviconResolved.contentType);

      recomputeAppearance();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
    return result;
  }, [recomputeAppearance]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchAll();
    }, 8 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [fetchAll]);

  /*
   * 伙伴品牌到达 / 变化后重算一次。
   *
   * 这个 effect 存在的唯一理由：伙伴品牌是独立请求，和平台配置并行，
   * 通常比平台配置更快（后者要打 6 个接口），但也可能更慢。
   * 没有这一段，慢到时序就会「伙伴品牌迟迟不生效」——
   * 页面一直挂着平台品牌，直到 8 分钟后的轮询才变过来。
   *
   * 不需要在这里判断「平台数据到了没」：recomputeAppearance 读的是两个 ref，
   * 平台那份没到就是初始值（localStorage），到了自然就是新值。顺序无关。
   */
  useEffect(() => {
    recomputeAppearance();
  }, [partnerBrand, recomputeAppearance]);

  const contextValue = useMemo(
    () => ({
      status,
      lynxConfig,
      siteFooter,
      siteAppearance,
      siteLogosThemed,
      siteFavicons,
      siteBrand,
      partnerBrand,
      loading,
      refresh: fetchAll,
    }),
    [status, lynxConfig, siteFooter, siteAppearance, siteLogosThemed, siteFavicons, siteBrand, partnerBrand, loading, fetchAll],
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
