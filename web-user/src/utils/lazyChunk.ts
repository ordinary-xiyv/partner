import { lazy as reactLazy, type LazyExoticComponent, type ComponentType } from 'react';

/**
 * 动态 import 失败常见于：发版后旧 index 仍引用旧哈希 chunk、或多前端节点版本不一致。
 * Nginx 应对 index.html 禁用强缓存；此处在同一会话内最多自动刷新一次，争取拉到新入口。
 */
const CHUNK_LOAD_ERR =
  /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed/i;

const RELOAD_FLAG = 'vite_lazy_chunk_reload_once';

export function lazy<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return reactLazy(async () => {
    try {
      return await factory();
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (CHUNK_LOAD_ERR.test(msg) && typeof sessionStorage !== 'undefined') {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
        }
      }
      throw err;
    }
  });
}
