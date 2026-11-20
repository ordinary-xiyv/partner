import { useEffect, useState } from 'react';
import { getTokens } from '../api';
import { useUser } from '../contexts/UserContext';
import type { Token } from '../types';

/** 当前用户是否至少拥有一个 API 令牌（未登录视为无） */
export function useUserHasApiToken(enabled: boolean) {
  const { user } = useUser();
  const [hasApiToken, setHasApiToken] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHasApiToken(null);
      return;
    }

    if (!user) {
      setHasApiToken(false);
      return;
    }

    let cancelled = false;
    setHasApiToken(null);

    void (async () => {
      try {
        const res = await getTokens({ p: 1, page_size: 1 });
        if (cancelled) return;
        if (!res.data.success) {
          setHasApiToken(false);
          return;
        }
        const raw = res.data.data as { items?: Token[]; total?: number } | Token[] | undefined;
        const items: Token[] = Array.isArray(raw) ? raw : raw?.items ?? [];
        const total =
          !Array.isArray(raw) && raw && typeof raw === 'object' && typeof raw.total === 'number'
            ? raw.total
            : items.length;
        setHasApiToken(total > 0 || items.length > 0);
      } catch {
        if (!cancelled) setHasApiToken(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, user?.id]);

  const needsApiKeyBanner = enabled && hasApiToken === false;

  return { hasApiToken, needsApiKeyBanner, checking: enabled && !!user && hasApiToken === null };
}
