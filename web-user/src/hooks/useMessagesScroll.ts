import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** 距底部小于该值视为「在底部」，流式/轮询更新时继续自动滚底 */
export const MESSAGES_SCROLL_STICK_THRESHOLD_PX = 72;

const RESTORE_MAX_ATTEMPTS = 24;
/** 滚动过程中写 sessionStorage 的节流间隔 */
const PERSIST_STORAGE_DEBOUNCE_MS = 150;
const STORAGE_KEY_PREFIX = 'lynxton_msg_scroll_v1_';

const scrollTopCache = new Map<string, number>();
const pendingStorageTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cacheKey(scopeKey: string, userId: number | undefined, sessionId: string): string {
  const uid = userId != null ? `u${userId}` : 'anon';
  return `${scopeKey}\u0000${uid}\u0000${sessionId}`;
}

function storageKey(scopeKey: string, userId: number | undefined, sessionId: string): string {
  const uid = userId != null ? `u${userId}` : 'anon';
  return `${STORAGE_KEY_PREFIX}${scopeKey}_${uid}_${sessionId}`;
}

function readStorageScrollTop(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
): number | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(scopeKey, userId, sessionId));
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

function writeStorageScrollTop(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
  scrollTop: number,
): void {
  try {
    sessionStorage.setItem(storageKey(scopeKey, userId, sessionId), String(Math.max(0, scrollTop)));
  } catch {
    // quota / private mode：忽略，内存缓存仍可用
  }
}

function removeStorageScrollTop(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
): void {
  const key = storageKey(scopeKey, userId, sessionId);
  const timer = pendingStorageTimers.get(key);
  if (timer != null) {
    clearTimeout(timer);
    pendingStorageTimers.delete(key);
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function scheduleStorageScrollTop(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
  scrollTop: number,
): void {
  const key = storageKey(scopeKey, userId, sessionId);
  const prev = pendingStorageTimers.get(key);
  if (prev != null) clearTimeout(prev);
  pendingStorageTimers.set(
    key,
    setTimeout(() => {
      pendingStorageTimers.delete(key);
      writeStorageScrollTop(scopeKey, userId, sessionId, scrollTop);
    }, PERSIST_STORAGE_DEBOUNCE_MS),
  );
}

function flushStorageScrollTop(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
  scrollTop: number,
): void {
  const key = storageKey(scopeKey, userId, sessionId);
  const prev = pendingStorageTimers.get(key);
  if (prev != null) {
    clearTimeout(prev);
    pendingStorageTimers.delete(key);
  }
  writeStorageScrollTop(scopeKey, userId, sessionId, scrollTop);
}

function readCachedScrollTop(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
): number | undefined {
  const primaryKey = cacheKey(scopeKey, userId, sessionId);
  const primary = scrollTopCache.get(primaryKey);
  if (primary !== undefined) return primary;

  const fromStorage = readStorageScrollTop(scopeKey, userId, sessionId);
  if (fromStorage !== undefined) {
    scrollTopCache.set(primaryKey, fromStorage);
    return fromStorage;
  }

  if (userId != null) {
    const anonKey = cacheKey(scopeKey, undefined, sessionId);
    const anonMem = scrollTopCache.get(anonKey);
    if (anonMem !== undefined) return anonMem;
    const anonStorage = readStorageScrollTop(scopeKey, undefined, sessionId);
    if (anonStorage !== undefined) {
      scrollTopCache.set(anonKey, anonStorage);
      return anonStorage;
    }
  }
  return undefined;
}

function writeCachedScrollTop(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
  scrollTop: number,
  persistMode: 'debounce' | 'flush' = 'flush',
): void {
  scrollTopCache.set(cacheKey(scopeKey, userId, sessionId), scrollTop);
  if (persistMode === 'flush') {
    flushStorageScrollTop(scopeKey, userId, sessionId, scrollTop);
  } else {
    scheduleStorageScrollTop(scopeKey, userId, sessionId, scrollTop);
  }
}

export interface UseMessagesScrollOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  /** 模块隔离：text / image / video / speech */
  scopeKey: string;
  userId?: number;
  /** 当前会话消息/生成条数，变化后在 pending 时滚底 */
  contentLength: number;
  /** 无消息（欢迎页等），为 true 时不读写滚动缓存 */
  showEmpty: boolean;
  /** 横竖屏或移动/桌面布局切换 */
  viewportKey?: string | number | boolean;
}

export interface UseMessagesScrollResult {
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  /** 发送消息后调用：强制滚底并粘在底部 */
  scrollToEnd: () => void;
  /** 流式/状态更新：仅在用户仍在底部时跟滚 */
  scrollIfStuckToBottom: () => void;
}

export function clearMessagesScrollCache(
  scopeKey: string,
  userId: number | undefined,
  sessionId: string,
): void {
  scrollTopCache.delete(cacheKey(scopeKey, userId, sessionId));
  removeStorageScrollTop(scopeKey, userId, sessionId);
}

export function useMessagesScroll(options: UseMessagesScrollOptions): UseMessagesScrollResult {
  const { scrollRef, sessionId, scopeKey, userId, contentLength, showEmpty, viewportKey } = options;

  const stickToBottomRef = useRef(true);
  const skipStickUpdateRef = useRef(false);
  const pendingScrollToEndRef = useRef(false);
  const restoringScrollRef = useRef(false);
  const restoreTargetRef = useRef(0);
  const restoreAttemptsRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const scrollSyncedRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const showEmptyRef = useRef(showEmpty);
  showEmptyRef.current = showEmpty;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const prevSessionRef = useRef<string | null | undefined>(undefined);
  const prevViewportRef = useRef<typeof viewportKey>(undefined);
  const prevShowEmptyRef = useRef<boolean | undefined>(undefined);
  const prevUserIdRef = useRef<number | undefined>(userId);
  const prevContentLengthRef = useRef<number>(contentLength);

  const persistScrollTop = useCallback((
    sid: string,
    top: number,
    persistMode: 'debounce' | 'flush' = 'flush',
  ) => {
    if (showEmptyRef.current) return;
    writeCachedScrollTop(scopeKey, userIdRef.current, sid, top, persistMode);
  }, [scopeKey]);

  const flushCurrentScroll = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid || showEmptyRef.current) return;
    const el = scrollRef.current;
    const top = el ? el.scrollTop : lastScrollTopRef.current;
    if (!scrollSyncedRef.current && el == null) return;
    const existing = readCachedScrollTop(scopeKey, userIdRef.current, sid);
    // 卸载/切换时若测到 0，不要覆盖已有有效缓存（DOM 可能已卸成 0）
    if (top <= 0 && existing !== undefined && existing > 0) return;
    persistScrollTop(sid, top, 'flush');
  }, [scrollRef, scopeKey, persistScrollTop]);

  const applyScrollTop = useCallback((top: number, persist = true) => {
    const el = scrollRef.current;
    if (!el) return false;
    skipStickUpdateRef.current = true;
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.min(Math.max(0, top), maxTop);
    lastScrollTopRef.current = el.scrollTop;
    scrollSyncedRef.current = true;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = gap <= MESSAGES_SCROLL_STICK_THRESHOLD_PX;
    if (persist && !restoringScrollRef.current) {
      const sid = sessionIdRef.current;
      if (sid) persistScrollTop(sid, el.scrollTop);
    }
    skipStickUpdateRef.current = false;
    return true;
  }, [scrollRef, persistScrollTop]);

  const completeRestore = useCallback(() => {
    if (!restoringScrollRef.current) return;
    restoringScrollRef.current = false;
    restoreAttemptsRef.current = 0;
    const el = scrollRef.current;
    if (el) {
      const sid = sessionIdRef.current;
      if (sid) persistScrollTop(sid, el.scrollTop);
    }
  }, [scrollRef, persistScrollTop]);

  const finishRestoreScroll = useCallback(() => {
    if (!restoringScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const target = restoreTargetRef.current;
    applyScrollTop(target, false);
    const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);

    restoreAttemptsRef.current += 1;
    // 内容已撑开到目标，或尝试次数耗尽：结束恢复，避免永久卡死
    if (maxTop >= target || restoreAttemptsRef.current >= RESTORE_MAX_ATTEMPTS) {
      completeRestore();
    }
  }, [scrollRef, applyScrollTop, completeRestore]);

  const scheduleRestoreScroll = useCallback((saved: number) => {
    restoringScrollRef.current = true;
    restoreTargetRef.current = saved;
    restoreAttemptsRef.current = 0;
    stickToBottomRef.current = false;
    pendingScrollToEndRef.current = false;

    const tryRestore = () => {
      const el = scrollRef.current;
      if (!el) {
        restoreAttemptsRef.current += 1;
        if (restoreAttemptsRef.current < RESTORE_MAX_ATTEMPTS) {
          requestAnimationFrame(tryRestore);
        } else {
          restoringScrollRef.current = false;
        }
        return;
      }
      applyScrollTop(saved, false);
      finishRestoreScroll();
      if (restoringScrollRef.current) {
        requestAnimationFrame(finishRestoreScroll);
      }
    };
    requestAnimationFrame(tryRestore);
  }, [scrollRef, applyScrollTop, finishRestoreScroll]);

  const scrollToEndImmediate = useCallback(() => {
    if (restoringScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    skipStickUpdateRef.current = true;
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    lastScrollTopRef.current = el.scrollTop;
    scrollSyncedRef.current = true;
    stickToBottomRef.current = true;
    const sid = sessionIdRef.current;
    if (sid) persistScrollTop(sid, el.scrollTop);
    skipStickUpdateRef.current = false;
  }, [scrollRef, persistScrollTop]);

  const scrollToEnd = useCallback(() => {
    restoringScrollRef.current = false;
    restoreAttemptsRef.current = 0;
    pendingScrollToEndRef.current = true;
    stickToBottomRef.current = true;
    requestAnimationFrame(() => {
      scrollToEndImmediate();
    });
  }, [scrollToEndImmediate]);

  const scrollIfStuckToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (!stickToBottomRef.current || restoringScrollRef.current) return;
      scrollToEndImmediate();
    });
  }, [scrollToEndImmediate]);

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (skipStickUpdateRef.current) return;
      const el = e.currentTarget;
      lastScrollTopRef.current = el.scrollTop;
      scrollSyncedRef.current = true;
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = gap <= MESSAGES_SCROLL_STICK_THRESHOLD_PX;
      const sid = sessionIdRef.current;
      if (sid) persistScrollTop(sid, el.scrollTop, 'debounce');

      // 滚动中短暂显示细滚动条，停滚后隐藏（与项目侧栏风格一致）
      el.classList.add('is-scrolling');
      if (scrollIdleTimerRef.current != null) clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = setTimeout(() => {
        el.classList.remove('is-scrolling');
        scrollIdleTimerRef.current = null;
      }, 800);
    },
    [persistScrollTop],
  );

  /** 切换会话 / 视口 / 欢迎页 ↔ 消息列表 / 用户 */
  useLayoutEffect(() => {
    const prevSession = prevSessionRef.current;
    const prevVp = prevViewportRef.current;
    const prevEmpty = prevShowEmptyRef.current;
    const prevUserId = prevUserIdRef.current;

    const switchedSession = prevSession !== sessionId;
    const switchedVp = prevVp !== viewportKey;
    const switchedEmpty = prevEmpty !== showEmpty;
    const switchedUser = prevUserId !== userId;

    // 切会话前先把当前会话滚动位置落盘（不依赖下一次 onScroll）
    if (switchedSession && prevSession) {
      const el = scrollRef.current;
      const top = el ? el.scrollTop : lastScrollTopRef.current;
      if (scrollSyncedRef.current || el) {
        const existing = readCachedScrollTop(scopeKey, prevUserId, prevSession);
        if (!(top <= 0 && existing !== undefined && existing > 0)) {
          writeCachedScrollTop(scopeKey, prevUserId, prevSession, top, 'flush');
        }
      }
    }

    prevSessionRef.current = sessionId;
    prevViewportRef.current = viewportKey;
    prevShowEmptyRef.current = showEmpty;
    prevUserIdRef.current = userId;

    if (!switchedSession && !switchedVp && !switchedEmpty && !switchedUser) return;

    if (showEmpty || sessionId == null) {
      if (showEmpty) {
        restoringScrollRef.current = false;
        stickToBottomRef.current = true;
      }
      return;
    }

    const leftWelcome = prevEmpty === true && showEmpty === false;
    const remountedIntoMessages = prevEmpty === undefined && showEmpty === false;
    const saved = readCachedScrollTop(scopeKey, userId, sessionId);

    // 首次发送离开欢迎页：无缓存则滚底；有缓存（极少）则恢复
    if (leftWelcome) {
      if (saved !== undefined) {
        scheduleRestoreScroll(saved);
        return;
      }
      restoringScrollRef.current = false;
      stickToBottomRef.current = true;
      scrollToEndImmediate();
      return;
    }

    // 切会话 / 切用户 / 切视口 / 模块 remount 进入消息列表：优先恢复缓存
    if (
      saved !== undefined
      && (switchedSession || switchedUser || switchedVp || remountedIntoMessages)
    ) {
      scheduleRestoreScroll(saved);
      return;
    }

    if (saved === undefined && (switchedSession || remountedIntoMessages)) {
      restoringScrollRef.current = false;
      stickToBottomRef.current = true;
      scrollToEndImmediate();
    }
  }, [
    sessionId,
    viewportKey,
    showEmpty,
    scopeKey,
    userId,
    scrollRef,
    scheduleRestoreScroll,
    scrollToEndImmediate,
  ]);

  /** 同会话内消息增多：发送后或 pending 时在 DOM 更新后滚底 */
  useLayoutEffect(() => {
    if (showEmpty || sessionId == null) return;
    if (restoringScrollRef.current) return;

    const prevLen = prevContentLengthRef.current;
    const lenChanged = contentLength !== prevLen;
    prevContentLengthRef.current = contentLength;

    const force = pendingScrollToEndRef.current;
    if (!force && !lenChanged) return;
    if (!force && lenChanged && !stickToBottomRef.current) return;

    if (force) {
      pendingScrollToEndRef.current = false;
      stickToBottomRef.current = true;
    }
    scrollToEndImmediate();
  }, [contentLength, showEmpty, sessionId, scrollToEndImmediate]);

  /** 附件/图片撑高后：恢复中则续恢复，否则粘底时补滚 */
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || showEmpty || sessionId == null) return undefined;

    const ro = new ResizeObserver(() => {
      if (restoringScrollRef.current) {
        finishRestoreScroll();
        return;
      }
      if (!stickToBottomRef.current && !pendingScrollToEndRef.current) return;
      scrollToEndImmediate();
    });
    ro.observe(el);
    const inner = el.firstElementChild;
    if (inner) ro.observe(inner);

    return () => ro.disconnect();
  }, [sessionId, showEmpty, scrollRef, scrollToEndImmediate, contentLength, finishRestoreScroll]);

  /** 路由切走：保存滚动位置 */
  useEffect(() => {
    const flushOnPageHide = () => {
      flushCurrentScroll();
    };
    window.addEventListener('pagehide', flushOnPageHide);
    return () => {
      window.removeEventListener('pagehide', flushOnPageHide);
      if (scrollIdleTimerRef.current != null) {
        clearTimeout(scrollIdleTimerRef.current);
        scrollIdleTimerRef.current = null;
      }
      scrollRef.current?.classList.remove('is-scrolling');
      flushCurrentScroll();
    };
  }, [flushCurrentScroll, scrollRef]);

  return { onScroll, scrollToEnd, scrollIfStuckToBottom };
}
