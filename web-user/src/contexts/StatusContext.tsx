import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getStatus, getLynxConfig, getPublicSiteFooter, getPublicSiteLogosThemed, getPublicSiteFavicons, getPublicSiteAppearance } from '../api';
import { setCurrencyGlobal } from '../utils';
import type { StatusInfo, LynxSiteFooterConfig, LynxSiteLogoPublic, SiteLogosThemed } from '../types';
import type { SiteAppearance } from '../types/siteAppearance';
import { applySiteBrandInterpolation, syncDocumentTitleFromBrand } from '../i18n/siteBrandInterpolation';
import { applySiteFavicon, applySiteInitialFavicon, resolveSiteFaviconUrl } from '../utils/siteFavicon';
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
  resolvePartnerMarkInitial,
  resolvePartnerPageTitle,
  resolvePartnerPrimaryColor,
} from '../utils/partnerBrand';
import { setBrandPageTitleOverride, setBrandPrimaryColorOverride } from '../theme/brandOverride';
import i18n from '../i18n';
import { getDocsHomeUrl, resolveDocLang } from '../config/docs';
import { usePartnerSiteBrand, type PartnerSiteBrand } from '../hooks/usePartnerSiteBrand';
import { useTheme } from './ThemeContext';
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
  const { brand: partnerBrand, loading: partnerBrandLoading } = usePartnerSiteBrand();
  /**
   * 伙伴品牌是否「已经问过服务器」了。
   *
   * 这个标记专门用来保护主色的本地缓存（见 theme/brandOverride 的 CACHE_KEY）：
   *
   *   · 首屏时 partnerBrand 还是 null，但那不代表「这个站点没配色」，
   *     只代表「请求还没回来」。此时如果把 null 写进主色覆盖层，
   *     就会把刚读出来的缓存值清掉 —— 缓存等于白做，照样先闪一下紫色。
   *   · 只有请求确实结束了（成功拿到品牌 / 确认没有伙伴品牌），
   *     才允许用结果去改写覆盖层。
   *
   * 用 ref 是因为 recomputeAppearance 里有闭包陷阱（它被定时器复用，
   * 直接读 state 会读到首帧的旧值），和下面 partnerBrandRef 的处理一致。
   */
  const partnerBrandSettledRef = useRef(false);
  partnerBrandSettledRef.current = !partnerBrandLoading;
  /**
   * 伙伴品牌的最新值（ref 版）。
   *
   * 给 fetchAll 这类「不在渲染路径上、且会被定时器复用」的函数用：
   * 它捕获的是首次渲染的闭包，直接读 partnerBrand 会永远是 null。
   */
  const partnerBrandRef = useRef<PartnerSiteBrand | null>(null);
  partnerBrandRef.current = partnerBrand;

  /*
   * 当前明暗模式（ref 版）。
   *
   * 只被 favicon 的首字图标用：那个图标的底色是品牌主色，而平台默认主色
   * 亮/暗两套不同（#6d51fe / #8b73ff）。切主题后图标得跟着重画，否则
   * 会出现「整站变浅色了，标签图标还是深色版那个紫」。
   *
   * 为什么读 ref 而不是把 resolved 塞进依赖数组：applyFaviconDecision 是
   * 个 useCallback([]) 的空依赖函数（理由见它上面的注释 —— 它会被定时器
   * 和多个 effect 复用，依赖一变整个重算链就跟着抖）。用 ref 传值可以让
   * 它在被调用时读到最新模式，同时保持身份稳定。
   *
   * ThemeProvider 在 StatusProvider 外层（见 main.tsx），所以这里能拿到。
   */
  const { resolved: themeResolved } = useTheme();
  const themeResolvedRef = useRef(themeResolved);
  themeResolvedRef.current = themeResolved;

  const [siteAppearance, setSiteAppearance] = useState<SiteAppearance>(() => {
    const defaults = buildAppearanceDefaults();
    return mergeSiteAppearance(defaults, { local: readStoredSiteAppearance() });
  });
  const [siteLogosThemed, setSiteLogosThemed] = useState<SiteLogosThemed>({ light: null, dark: null });
  const [siteFavicons, setSiteFavicons] = useState<LynxSiteLogoPublic[]>([]);
  /**
   * 平台 favicon 列表的 ref 版。
   *
   * applyFaviconDecision 会被 fetchAll、recomputeAppearance、定时器多处调用，
   * 而这些地方拿到的都是首次渲染的闭包 —— 直接读 siteFavicons 会永远是空数组。
   * 用 ref 保证读到的总是最新一份。
   */
  const siteFaviconsRef = useRef<LynxSiteLogoPublic[]>([]);
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
   * favicon 的唯一决策点 —— 平台图标先铺，伙伴图标再覆盖，没配就画首字。
   *
   * ★ 为什么必须收敛成一个函数：平台 favicon 是在 fetchAll 里「无条件」
   *   应用的（`applySiteFavicon(平台第一张)`），而伙伴品牌是另一个并行请求。
   *   两边各自调 applySiteFavicon 会互相踩：
   *     · 平台后到 → 把伙伴配的图标盖掉
   *     · 伙伴侧清空后，8 分钟轮询又跑到 fetchAll 把平台图重新贴回来
   *   所以「最终该显示哪张」只允许在这里算一次。
   *
   * 取值顺序（2026-11-25 加入第三档「首字图标」）：
   *
   *   1. 伙伴配了 favicon_url           → 伙伴那张
   *   2. 伙伴没配 + 经销商（false）      → **首字图标**（绝不继承平台那张）
   *   3. 伙伴没配 + 自营 / 第三态        → 平台那张；平台也没有 → 首字图标
   *   4. 完全没有伙伴品牌（非白标站）    → 老行为，平台有就用、没有就清空
   *
   * ★ 第 2、3 档为什么要退到首字图标，而不是「清空」：
   *   商户在后台填了品牌名、没传标签图标，标签页就是一片空白（经销商）
   *   或者挂着平台的旧图（自营）。而页头已经画了「品牌色方块 + 首字」，
   *   标签页跟页头长得一样才是正常的。首字图标由 utils/siteFavicon 用
   *   canvas 现画成 data URL，不走网络。
   *
   * ★ 第 4 档为什么不也套首字：非白标站没有「伙伴品牌名」这个概念，
   *   页头显示的是 i18n 的 {{brandName}}（可能随语言变），拿它首字当
   *   图标会随语言切换换字，反而比空白更奇怪。这一档完全维持原状。
   */
  const applyFaviconDecision = useCallback(
    (platformFavicons: LynxSiteLogoPublic[]) => {
      const partner = partnerBrandRef.current;
      const mode = themeResolvedRef.current;
      const partnerFavicon = resolvePartnerFavicon(partner);
      if (partnerFavicon) {
        applySiteFavicon(partnerFavicon);
        return;
      }

      if (partner) {
        /* 伙伴有品牌、没传图标 —— 首字图标由 applySiteInitialFavicon 内部处理空值 */
        const initial = resolvePartnerMarkInitial(partner);
        if (partner.is_self_operated === false) {
          // 经销商：平台的对象存储标识/图片一律不继承，只画自己的首字
          applySiteInitialFavicon(initial, mode);
          return;
        }
        // 自营 / 后端没下发：平台有图先用平台的，没有才退到首字
        const platform = resolveSiteFaviconUrl(platformFavicons);
        if (platform.url) {
          applySiteFavicon(platform.url, platform.contentType);
          return;
        }
        applySiteInitialFavicon(initial, mode);
        return;
      }

      // 没有伙伴品牌：维持「平台有就用、没有就清空」
      const platform = resolveSiteFaviconUrl(platformFavicons);
      applySiteFavicon(platform.url, platform.contentType);
    },
    [],
  );

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
    /*
     * 主色：只在「伙伴品牌请求已经结束」时才写给覆盖层。
     *
     * 首屏那一刻 partner 一定是 null（请求还没回来），此时写 null 会把
     * localStorage 里的缓存主色删掉 —— 而缓存的全部意义就是让首帧对上色。
     * 所以在请求未结束前什么都不做，让 main.tsx 铺好的缓存色继续生效。
     *
     * 请求结束后再写：有颜色就用伙伴的，没有（null）就回落到平台默认，
     * 同时把缓存清掉（下次启动不该再拿这个站点的旧色）。
     */
    if (partnerBrandSettledRef.current) {
      setBrandPrimaryColorOverride(resolvePartnerPrimaryColor(partner?.primary_color));
    }
    setBrandPageTitleOverride(resolvePartnerPageTitle(partner));
    // 放在 syncBrandFromAppearance 之后：那次调用用的是设置前的旧标题
    syncDocumentTitleFromBrand();

    /*
     * favicon 跟着外观一起重算。
     *
     * 这里不再自己判断「伙伴有没有配」—— 取值规则全在 applyFaviconDecision 里，
     * 由它决定用伙伴的、用平台的、还是一张都不显示。两处各判断一遍必然会
     * 分叉，之前就是「伙伴没配就什么都不做」，结果平台那张二维码图永远
     * 留在经销商站点的标签页上。
     *
     * 平台 favicon 列表用 state 里的最新一份：fetchAll 拉到后会 setSiteFavicons，
     * 这个函数被 useEffect 依赖着 partnerBrand，所以两边谁后到都会重算一次。
     */
    applyFaviconDecision(siteFaviconsRef.current);

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
  }, [applyAppearance, applyFaviconDecision]);

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
       * 平台 favicon 先记下来，最终应用交给 applyFaviconDecision。
       *
       * 这里**不能**直接 applySiteFavicon(平台那张) 了。原来的写法是无条件铺
       * 平台图标，再由 recomputeAppearance 判断要不要用伙伴的覆盖 —— 于是
       * 「经销商没配 favicon」这种情况没有任何一处会去清它，平台那张图
       * （实测是一张二维码）就一直挂在经销商站点的标签页上。
       *
       * 现在只更新 ref，由决策函数统一算「最终该显示哪张」。
       */
      siteFaviconsRef.current = nextFavicons;
      applyFaviconDecision(nextFavicons);

      recomputeAppearance();
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
    return result;
  }, [recomputeAppearance, applyFaviconDecision]);

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

  /*
   * 明暗模式变了 → 重算一次 favicon。
   *
   * 只有「首字图标」会受影响（图标的底色是品牌色，而平台默认色亮/暗两套
   * 不同）；伙伴传了真图时 applyFaviconDecision 会走 applySiteFavicon，
   * 那边有 url 缓存键挡着，不会重复解码。
   *
   * ★ 为什么必须显式加这个 effect：StatusProvider 在 ThemeProvider 的子树里，
   *   子 effect 先于父 effect 执行 —— 切主题那一刻本组件的 effect 读到的
   *   documentElement.theme-mode 还是旧值，图标会停在上一个配色上不更新。
   *   所以这里把 latest 的 resolved 传进决策函数（见 applyFaviconDecision
   *   里的 themeResolvedRef），而不是让它自己去读 DOM。
   */
  useEffect(() => {
    applyFaviconDecision(siteFaviconsRef.current);
  }, [themeResolved, applyFaviconDecision]);

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
