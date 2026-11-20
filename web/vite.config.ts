import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 代理目标：伙伴后端的默认端口是 3004（见 backend/README 与 partner/README）。
 * 要连别的环境时用 PARTNER_API_TARGET 覆盖，不要改这里的默认值——
 * 默认值写死成远端地址后，本地起服务会莫名其妙连到别人的环境去。
 */
const apiTarget = process.env.PARTNER_API_TARGET || 'http://127.0.0.1:3004';

/**
 * 允许访问 dev server 的额外域名，逗号分隔。
 *
 * 为什么需要这个：Vite 5.4.12 起加了 Host 头校验，用 /etc/hosts 把
 * shop.yunqi.com 指向 127.0.0.1 后直接访问，会被挡下并提示
 * 「This host (shop.yunqi.com) is not allowed.」——
 * 白标是按 window.location.hostname 解析品牌的，地址栏里必须真的是那个域名，
 * 所以本地要测「自定义域名」就绕不开这一关。
 *
 * 为什么不用 allowedHosts: true：
 * 那等于关掉 DNS 重绑定防护，任何域名都能访问你的 dev server。
 * 这里只放行你显式指定的测试域名，默认仍是 localhost。
 *
 * 用法：
 *   DEV_ALLOWED_HOSTS=shop.yunqi.com,shop.test npm run dev
 */
const allowedHosts = (process.env.DEV_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      /*
       * 页面代码里写的是 '@lynx/shared' 与 '@lynx/shared/*'。
       * 这里指向同目录下的 src/shared，是为了让从 lynx-dealer 搬过来的页面
       * 一行都不用改——改 import 路径不但量大，还容易漏。
       *
       * 顺序很重要，必须用数组而不是对象：
       *   '@lynx/shared/' 在前（精确到带斜杠的子路径），
       *   '@lynx/shared'  在后（裸包名）。
       * 用对象字面量时 Vite 按 key 顺序匹配，'@lynx/shared' 先命中会把
       * '@lynx/shared/api/dealer' 拼成 'src/shared/index.ts/api/dealer'，
       * 报 ENOTDIR —— 这个坑踩过一次。
       */
      { find: /^@lynx\/shared\/(.*)$/, replacement: path.resolve(__dirname, 'src/shared/$1') },
      { find: /^@lynx\/shared$/, replacement: path.resolve(__dirname, 'src/shared/index.ts') },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, 'src/$1') },
    ],
  },
  server: {
    /*
     * 5176：伙伴前端的既定端口。
     * 5173 是经销商后台（lynx-dealer 时代的约定，那边已迁走），
     * 5174 被 lynxtonapi/web-admin 占用，5175 是 dealer-user。
     */
    port: 5176,
    host: true,
    // 只在配置了测试域名时才动 allowedHosts，不配就保持 Vite 默认（localhost）
    ...(allowedHosts.length ? { allowedHosts } : {}),
    proxy: {
      '/api/partner': { target: apiTarget, changeOrigin: true },
      // 品牌图上传走同一个 partner 前缀，单独列一条便于排查
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
