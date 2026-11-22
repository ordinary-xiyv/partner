import { useCallback, useEffect, useState } from 'react';

/**
 * 伙伴后台下发的品牌（按站点身份从 partner/backend 读取）。
 *
 * 这是「两套平台共用一份数据」在客户站的落点：
 * 伙伴后台改 lc_distribution_merchants 的 brand_* 列，客户站刷新就生效。
 *
 * 只覆盖 8 个核心字段 + 客服（见 PartnerSiteBrand 的注释）。其余外观
 * （页头导航、页脚栏目、banner、登录页媒体）继续走平台默认的
 * /api/lynx/branding/site，不受伙伴后台影响。
 */

/**
 * 8 个核心字段 + 接口基地址 + 客服，与 partner/backend 的 PublicSiteBrand 一致
 */
export interface PartnerSiteBrand {
  name: string;
  short_name: string;
  logo_url: string;
  primary_color: string;
  page_title: string;
  favicon_url: string;
  tagline: string;
  /**
   * 接口基地址（伙伴后台「接口基地址」那一格）。
   *
   * 空串表示伙伴没配 —— 这是常态，绝大多数商户都不会填。为空时客户站
   * 回落到 window.location.origin（见 sdkSnippets.resolveSiteBaseUrl）。
   *
   * 这一项曾经**不下发**，客户站只能拿主站 /api/status 的 server_address，
   * 结果首页示例和接入文档里显示的都是主站 IP，分销商的客户照着复制就
   * 跑到主站去了。现在下发，写入侧限 http(s) 绝对地址。
   *
   * 可选（?: ）是因为它比其余字段晚上线：客户站可能连到旧版伙伴后端，
   * 那时响应里没有这个键，读成 undefined。前端按「空」处理即可，不必报错。
   */
  api_base_url?: string;
  /**
   * 客服联系方式。
   *
   * 这是 partner 侧的扁平结构（email/phone/wechat/note），和 web-user 内部
   * CustomerServiceConfig（enabled/show_contact/...）不是一回事：前者是
   * 「联系方式是什么」，后者是「客服浮窗怎么显示」。桥接逻辑见
   * partnerBrandToCustomerService。
   */
  support: Record<string, unknown>;
  /**
   * 页脚版权行（伙伴后台「页脚版权」那一组）。
   *
   * 可选，理由同 api_base_url：这一块比核心 8 个字段晚上线，客户站可能
   * 连到旧版伙伴后端，那时响应里没有这个键。
   *
   * 字段全用「可为 null」表达三态，这个区别很关键：
   *   null / 键不存在  → 商户没配过，沿用平台侧的值
   *   空串             → 商户明确清空，这一项不显示
   *   非空串           → 用商户填的
   * 如果都塌成空串，商户只是没动过版权配置，备案号却会从页脚消失。
   */
  footer?: PartnerSiteFooter | null;
}

/** 伙伴后台可配的页脚版权行内容 */
export interface PartnerSiteFooter {
  copyright_text?: string | null;
  terms_label?: string | null;
  privacy_label?: string | null;
  beian_label?: string | null;
  /** 整块显隐。null/缺省 = 没配过，沿用平台侧开关 */
  enabled?: boolean | null;
}

export interface PartnerBrandState {
  /** null 表示这个站点没有伙伴品牌（未绑定 / 未配置），一切走平台默认 */
  brand: PartnerSiteBrand | null;
  loading: boolean;
  /** 请求失败的原因，仅用于开发排查，不往用户界面上抛 */
  error: string | null;
}

/**
 * 读伙伴品牌失败时的行为：安静地当作「没有」。
 *
 * 客户站不能因为伙伴后端挂了就整站不可用 —— 那是把分销商的品牌配置
 * 变成了单点故障。降级到平台默认品牌，页面照常能看。
 * 所以这里吞掉错误，只留一句 console 提示给排查用。
 */
async function fetchPartnerSiteBrand(signal: AbortSignal): Promise<PartnerSiteBrand | null> {
  /*
   * 路径走相对地址，由 nginx / vite 代理转给伙伴后端。
   *
   * 不拼绝对域名，是因为客户站会部署在不同分销商的域名下：把伙伴后端的
   * 地址硬编码进构建产物，换一个域名就得重新构建一次。
   * 代理侧负责注入 X-Site-ID / X-Site-Host / X-Site-Credential 三个头。
   */
  const res = await fetch('/api/partner/public/site-brand', {
    method: 'GET',
    credentials: 'omit', // 这是匿名接口，带上用户的 cookie 反而多一层风险
    headers: { 'Cache-Control': 'no-cache' },
    signal,
  });
  if (res.status === 403 || res.status === 404) {
    // 站点没绑身份，或伙伴后端没部署这条路由 —— 都属于「本站没有伙伴品牌」
    return null;
  }
  if (!res.ok) {
    throw new Error(`读取伙伴品牌失败：HTTP ${res.status}`);
  }
  const body = (await res.json()) as { success?: boolean; data?: PartnerSiteBrand };
  if (!body.success || !body.data) return null;
  return body.data;
}

/**
 * 读一次伙伴品牌。
 *
 * 只读一次、不做轮询：品牌配置是低频变更，客户站刷新页面时会重新读。
 * 之前 StatusContext 里有 8 分钟轮询，那是为了同步平台侧的运营配置；
 * 伙伴品牌跟着页面加载走就够了，没必要占用同样的轮询频率。
 */
export function usePartnerSiteBrand(): PartnerBrandState {
  const [state, setState] = useState<PartnerBrandState>({
    brand: null,
    loading: true,
    error: null,
  });

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const brand = await fetchPartnerSiteBrand(signal);
      if (signal.aborted) return;
      setState({ brand, loading: false, error: null });
    } catch (err) {
      if (signal.aborted) return;
      // 降级：当作没有伙伴品牌，页面走平台默认
      console.warn('[partner-brand] 读取失败，回退到平台默认品牌：', err);
      setState({ brand: null, loading: false, error: (err as Error)?.message ?? '读取失败' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return state;
}
