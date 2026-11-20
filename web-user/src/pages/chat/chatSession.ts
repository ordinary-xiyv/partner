/**
 * 文本 / 图像对话的 localStorage 与流式落盘通知（按 scope 隔离，互不触发对方重载）
 */
export type ChatShellScope = 'text' | 'image';

const STORAGE_KEY_PREFIX = 'lynxton_chat_conversations_v2';

export function getStorageKey(userId: number | undefined, scope: ChatShellScope): string {
  const bucket = scope === 'image' ? 'image' : 'text';
  return userId != null ? `${STORAGE_KEY_PREFIX}_${bucket}_u${userId}` : `${STORAGE_KEY_PREFIX}_${bucket}`;
}

const LAST_ACTIVE_KEY_PREFIX = 'lynxton_chat_last_active_v1';

function lastActiveConversationStorageKey(userId: number | undefined, scope: ChatShellScope): string {
  const bucket = scope === 'image' ? 'image' : 'text';
  return userId != null ? `${LAST_ACTIVE_KEY_PREFIX}_${bucket}_u${userId}` : `${LAST_ACTIVE_KEY_PREFIX}_${bucket}`;
}

/** 上次在侧栏选中的会话 id（与会话列表分 key 存，路由离开再进入仍可恢复） */
export function readLastActiveConversationId(userId: number | undefined, scope: ChatShellScope): string | null {
  try {
    const raw = localStorage.getItem(lastActiveConversationStorageKey(userId, scope));
    if (!raw) return null;
    const id = raw.trim();
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeLastActiveConversationId(userId: number | undefined, scope: ChatShellScope, id: string | null): void {
  try {
    const key = lastActiveConversationStorageKey(userId, scope);
    if (id == null || id === '') localStorage.removeItem(key);
    else localStorage.setItem(key, id);
  } catch { /* quota */ }
}

export function saveConversationsJson(json: string, userId: number | undefined, scope: ChatShellScope): boolean {
  try {
    localStorage.setItem(getStorageKey(userId, scope), json);
    return true;
  } catch {
    return false;
  }
}

export function saveConversations<T>(convs: T[], userId: number | undefined, scope: ChatShellScope): boolean {
  try {
    localStorage.setItem(getStorageKey(userId, scope), JSON.stringify(convs));
    return true;
  } catch {
    return false;
  }
}

const listenersByScope = new Map<ChatShellScope, Set<() => void>>();

export function subscribeChatPersist(scope: ChatShellScope, cb: () => void): () => void {
  let set = listenersByScope.get(scope);
  if (!set) {
    set = new Set();
    listenersByScope.set(scope, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) listenersByScope.delete(scope);
  };
}

function emitChatPersist(scope: ChatShellScope): void {
  listenersByScope.get(scope)?.forEach((cb) => {
    try {
      cb();
    } catch { /* ignore */ }
  });
}

export function persistStreamingConversations<T>(convs: T[], userId: number | undefined, scope: ChatShellScope): boolean {
  const ok = saveConversations(convs, userId, scope);
  if (ok) {
    emitChatPersist(scope);
  }
  return ok;
}

export function genConversationId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export type BlankChatConversation = {
  id: string;
  title: string;
  createdAt: number;
  messages: [];
  models: [];
};

export function createBlankConversation(title: string): BlankChatConversation {
  return {
    id: genConversationId(),
    title,
    createdAt: Date.now(),
    messages: [],
    models: [],
  };
}
