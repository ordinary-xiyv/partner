/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEPLOY_MODE?: 'domestic' | 'overseas';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
