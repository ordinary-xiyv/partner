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

  const proxyOptions = () => ({
    target: apiTarget,
    changeOrigin: true,
    configure(proxy) {
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
    },
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
        '/api': proxyOptions(),
        '/v1': proxyOptions(),
      },
    },
    build: {
      outDir: 'dist',
    },
  };
});
