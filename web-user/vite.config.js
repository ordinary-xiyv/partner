import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig(({ mode }) => {
  // USER_SITE_* is read by the Vite server only. Never use the VITE_ prefix for the credential.
  const env = loadEnv(mode, __dirname, ['USER_', 'VITE_']);
  const apiTarget = env.USER_API_DEV_PROXY_TARGET || 'http://localhost:3000';
  /*
   * 伙伴后端的地址。客户站里有两类接口，分属两个服务：
   *   · /api/*          → lynxtonapi user-api（业务接口，靠下面注入的站点三头识别商户）
   *   · /api/partner/*  → 伙伴后端（读商户品牌配置、公开品牌接口）
   * 两者不能共用一个 target，否则伙伴品牌接口会被打到 user-api 上，
   * 拿回 user-api 自己的 404 —— 表现为「品牌设置保存了但客户站没反应」。
   */
  const partnerTarget = env.USER_PARTNER_PROXY_TARGET || 'http://127.0.0.1:3004';
  const siteID = env.USER_SITE_ID || '';
  const siteDomain = env.USER_SITE_DOMAIN || '';
  const siteCredential = env.USER_SITE_CREDENTIAL || '';
  const supplied = [siteID, siteDomain, siteCredential].filter(Boolean).length;
  if (supplied !== 0 && supplied !== 3) {
    throw new Error('Vite site proxy requires USER_SITE_ID, USER_SITE_DOMAIN and USER_SITE_CREDENTIAL together');
  }
  if (supplied === 3) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(siteID) ||
        !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(siteDomain) ||
        !/^[0-9a-f]{64}$/.test(siteCredential)) {
      throw new Error('Invalid USER_SITE_ID, USER_SITE_DOMAIN or USER_SITE_CREDENTIAL for Vite proxy');
    }
    if (env.VITE_API_URL) {
      throw new Error('VITE_API_URL must be empty when using the Vite site proxy');
    }
  }

  /*
   * 站点身份头的注入逻辑，两个 target 共用。
   *
   * 客户站要读两类接口，两边都需要这三个头来认商户：
   *   · user-api    —— 业务接口按站点身份做数据隔离
   *   · 伙伴后端     —— /api/partner/public/site-brand 拿这三个头查商户品牌
   * 所以注入逻辑不能只挂在其中一条代理上。
   */
  const withSiteHeaders = (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      // Browser-supplied site headers are never trusted, even when dev site config is absent.
      for (const name of ['X-Site-ID', 'X-Site-Host', 'X-Site-Credential']) {
        proxyReq.removeHeader(name);
      }
      if (supplied === 3) {
        proxyReq.setHeader('X-Site-ID', siteID);
        proxyReq.setHeader('X-Site-Host', siteDomain);
        proxyReq.setHeader('X-Site-Credential', siteCredential);
      }
    });
  };

  const proxyOptions = () => ({
    target: apiTarget,
    changeOrigin: true,
    configure: withSiteHeaders,
  });

  return {
    plugins: [react(), svgr()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        /*
         * 必须排在 '/api' 前面。Vite 按声明顺序匹配，'/api' 是前缀通配，
         * 放在前面会把 /api/partner/* 一起吞掉、转发到 user-api。
         * 这条同样要注入站点三头 —— 伙伴后端的公开品牌接口就是靠它们认商户的，
         * 漏了会稳定返回 403「站点身份无效」。
         */
        '/api/partner': {
          target: partnerTarget,
          changeOrigin: true,
          configure: withSiteHeaders,
        },
        '/api': proxyOptions(),
        '/v1': proxyOptions(),
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
