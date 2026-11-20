import { mutateSessionList } from '../../features/session-persist';
import type { SpeechGeneration, SpeechSession } from '../../features/speechGen/speechTypes';
import i18n from '../../i18n';
import { isInterruptedFetchMessage } from '../../features/chat/generationInterrupt';

const STORAGE_KEY_PREFIX = 'lynxton_speech_sessions_v1';
const COMPOSER_PREFS_KEY_PREFIX = 'lynxton_speech_composer_prefs_v1';
const ACTIVE_SESSION_KEY_PREFIX = 'lynxton_speech_active_session_v1';

function getStorageKey(userId?: number) {
  return userId ? `${STORAGE_KEY_PREFIX}_u${userId}` : STORAGE_KEY_PREFIX;
}

function getComposerPrefsKey(userId?: number) {
  return userId ? `${COMPOSER_PREFS_KEY_PREFIX}_u${userId}` : COMPOSER_PREFS_KEY_PREFIX;
}

export function getActiveSessionStorageKey(userId?: number) {
  return userId ? `${ACTIVE_SESSION_KEY_PREFIX}_u${userId}` : ACTIVE_SESSION_KEY_PREFIX;
}

export function loadPersistedActiveSessionId(userId?: number): string | null {
  try {
    return localStorage.getItem(getActiveSessionStorageKey(userId));
  } catch {
    return null;
  }
}

export function savePersistedActiveSessionId(userId: number | undefined, sessionId: string | null) {
  try {
    const key = getActiveSessionStorageKey(userId);
    if (sessionId) localStorage.setItem(key, sessionId);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function replaceInterruptedSpeechError(g: SpeechGeneration): SpeechGeneration {
  if (g.status === 'failed' && g.errorMessage && isInterruptedFetchMessage(g.errorMessage)) {
    return { ...g, errorMessage: i18n.t('chat.taskInterrupted') };
  }
  return g;
}

/** 页面刷新后：进行中的一次性合成无法续跑，标记为中断 */
export function finalizeInterruptedSpeechSessions(sessions: SpeechSession[]): SpeechSession[] {
  const interruptedText = i18n.t('chat.taskInterrupted');
  return sessions.map((s) => ({
    ...s,
    generations: (s.generations || []).map((g) => {
      if (g.status === 'pending') {
        return { ...g, status: 'failed', errorMessage: interruptedText };
      }
      return replaceInterruptedSpeechError(g);
    }),
  }));
}

export function loadSpeechSessions(userId?: number): SpeechSession[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SpeechSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.id === 'string')
      .map((s) => ({
        ...s,
        generations: (s.generations || []).map(replaceInterruptedSpeechError),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveSpeechSessions(sessions: SpeechSession[], userId?: number): boolean {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(sessions));
    return true;
  } catch {
    return false;
  }
}

export function loadSpeechComposerPrefs(userId?: number): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(getComposerPrefsKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function saveSpeechComposerPrefs(
  prefs: { model: string; voice: string; languageType: string },
  userId?: number,
) {
  try {
    localStorage.setItem(getComposerPrefsKey(userId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

const persistListeners = new Set<() => void>();

export function subscribeSpeechPersist(cb: () => void): () => void {
  persistListeners.add(cb);
  return () => persistListeners.delete(cb);
}

function emitSpeechPersist() {
  persistListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

let suppressPersistSync = 0;

export function shouldSkipSpeechPersistSync(): boolean {
  return suppressPersistSync > 0;
}

function pickRicherGeneration(a: SpeechGeneration, b: SpeechGeneration): SpeechGeneration {
  if (a.status === 'completed' && b.status !== 'completed') return a;
  if (b.status === 'completed' && a.status !== 'completed') return b;
  return a.createdAt >= b.createdAt ? a : b;
}

export function mergeSpeechSessionsForMutation(mem: SpeechSession[], ls: SpeechSession[]): SpeechSession[] {
  const byId = new Map<string, SpeechSession>();
  for (const s of ls) byId.set(s.id, s);
  for (const s of mem) {
    const existing = byId.get(s.id);
    if (!existing) {
      byId.set(s.id, s);
      continue;
    }
    const gensById = new Map<string, SpeechGeneration>();
    for (const g of existing.generations) gensById.set(g.id, g);
    for (const g of s.generations) {
      const prev = gensById.get(g.id);
      gensById.set(g.id, prev ? pickRicherGeneration(g, prev) : g);
    }
    const mergedGenerations = Array.from(gensById.values()).sort((x, y) => x.createdAt - y.createdAt);
    const base = s.generations.length >= existing.generations.length ? s : existing;
    byId.set(s.id, { ...base, generations: mergedGenerations });
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function runSpeechSessionMutation(
  userId: number | undefined,
  mutator: (prev: SpeechSession[]) => SpeechSession[],
  memSnapshot?: SpeechSession[],
): { next: SpeechSession[]; persistOk: boolean } {
  return mutateSessionList({
    memSnapshot,
    load: () => loadSpeechSessions(userId),
    merge: mergeSpeechSessionsForMutation,
    stripForPersist: (items) => items,
    save: (items) => saveSpeechSessions(items, userId),
    emitPersist: emitSpeechPersist,
    mutator,
    onSuppressSync: {
      enter: () => { suppressPersistSync += 1; },
      exit: () => { suppressPersistSync -= 1; },
    },
  });
}

export function updateSpeechGenerationInStorage(
  userId: number | undefined,
  sessionId: string,
  generationId: string,
  updater: (g: SpeechGeneration) => SpeechGeneration,
): { next: SpeechSession[]; persistOk: boolean } {
  return runSpeechSessionMutation(userId, (prev) =>
    prev.map((s) => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        generations: s.generations.map((g) => (g.id === generationId ? updater(g) : g)),
      };
    }),
  );
}

export function genSpeechSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function genSpeechGenerationId(): string {
  return `sg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createBlankSpeechSession(title: string): SpeechSession {
  return {
    id: genSpeechSessionId(),
    createdAt: Date.now(),
    title,
    generations: [],
  };
}

export function sessionTitleFromText(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.length > 28 ? `${trimmed.slice(0, 28)}…` : trimmed;
}
