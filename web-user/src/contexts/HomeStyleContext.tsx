import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getHomePageContent } from '../api';
import {
  DEFAULT_HOME_STYLE,
  parseHomeStyle,
  type HomeStyle,
} from '../config/homeStyle';

/**
 * 首页风格的来源决策。
 *
 * 有两个地方能决定"用哪套首页"：
 *   1. 伙伴后台（brand_landing.layout_style）—— 商户自己的选择
 *   2. 平台侧（option HomePageContent）—— 运营给直营站配的
 *
 * 优先级：伙伴选择 > 平台配置 > 默认值。
 *
 * 为什么伙伴优先：这是白标产品的核心承诺——"你的站点你做主"。
 * 一个商户已经明确选了 B，结果被平台侧的运营配置覆盖掉，
 * 那这个开关就是假的。反过来，没绑定伙伴身份的站点（平台直营）
 * 继续走原来的平台配置，不能因为加了新机制就让直营站突然变样。
 *
 * 两者的请求并行发出，而不是串行：
 * 首页是首屏，多一次串行往返就是多几百毫秒白屏。
 */
interface HomeStyleContextValue {
  style: HomeStyle;
  loading: boolean;
  /** 当前风格是谁定的，仅用于开发排查，不上界面 */
  source: 'partner' | 'platform' | 'default';
  refresh: () => Promise<void>;
}

const HomeStyleContext = createContext<HomeStyleContextValue | null>(null);

export function HomeStyleProvider({ children }: { children: React.ReactNode }) {
  const [style, setStyle] = useState<HomeStyle>(DEFAULT_HOME_STYLE);
  const [source, setSource] = useState<'partner' | 'platform' | 'default'>('default');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      /*
       * 伙伴风格来自 StatusContext 已经拉过的品牌数据吗？
       * 不是——那个 context 挂在更下层（要在 AntdAppProvider 里面才能
       * 用 message），而首页门禁的位置在它上面。所以这里单独读一次
       * /api/partner/public/site-brand。
       *
       * 这确实是一次重复请求（StatusContext 也会读）。但：
       *   · 它是匿名接口，服务端只有一个 indexed 查询，成本可忽略
       *   · 换来的好处是首页不必等整个 StatusContext 就绪（那里面有
       *     6 个接口 + 8 分钟轮询），首屏可以更快出来
       *   · 浏览器会复用同一个连接，实际开销是一个 RTT 的一部分
       */
      const [partnerRes, platformRes] = await Promise.allSettled([
        fetch('/api/partner/public/site-brand', {
          method: 'GET',
          credentials: 'omit',
          headers: { 'Cache-Control': 'no-cache' },
        }).then(async (res) => {
          if (res.status === 403 || res.status === 404 || !res.ok) return null;
          const body = (await res.json()) as { success?: boolean; data?: { home_style?: string } };
          if (!body.success || !body.data) return null;
          return body.data.home_style ?? null;
        }),
        getHomePageContent(),
      ]);

      const partnerStyle = partnerRes.status === 'fulfilled' ? partnerRes.value : null;

      if (partnerStyle) {
        // 伙伴明确选过 → 用它，不再看平台配置
        setStyle(parseHomeStyle(partnerStyle));
        setSource('partner');
        return;
      }

      if (platformRes.status === 'fulfilled') {
        const data = platformRes.value?.data;
        if (data?.success === true) {
          setStyle(parseHomeStyle(data.data));
          setSource('platform');
          return;
        }
      }

      setStyle(DEFAULT_HOME_STYLE);
      setSource('default');
    } catch {
      // 任何异常都退回默认风格：首页不能因为风格读不到就白屏
      setStyle(DEFAULT_HOME_STYLE);
      setSource('default');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ style, loading, source, refresh }),
    [style, loading, source, refresh],
  );

  return <HomeStyleContext.Provider value={value}>{children}</HomeStyleContext.Provider>;
}

export function useHomeStyle(): HomeStyleContextValue {
  const ctx = useContext(HomeStyleContext);
  if (!ctx) {
    throw new Error('useHomeStyle must be used within HomeStyleProvider');
  }
  return ctx;
}
