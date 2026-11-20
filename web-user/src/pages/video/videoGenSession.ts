/** 视频生成会话 localStorage 与跨实例同步（切走路由后仍可由后台轮询落盘） */

import { mutateSessionList } from '../../features/session-persist';
import { coercePlaybackVideoUrl, isPresignedObjectStorageUrl } from '../../features/videoGen/videoOutputUrl';
import { parseVideoTaskApiPollResponse } from '../../features/videoGen/videoTaskModel';
import { isInterruptedFetchMessage } from '../../features/chat/generationInterrupt';
import i18n from '../../i18n';
import {
  attachmentPreviewStoreKey,
  hydrateAttachmentPreviewMemoryCache,
  putAttachmentPreview,
} from './attachmentPreviewStore';

export type VideoTaskStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'unknown';

export type VideoGenMode = 't2v' | 'first_frame' | 'first_last' | 'omni_ref';

export type PendingAttachment = {
  id: string;
  kind: 'image' | 'video' | 'audio';
  name: string;
  preview: string;
  sizeBytes: number;
  /** 本地探测的源视频时长（秒），欢乐马 video-edit 上传前写入 */
  sourceDurationSec?: number;
  ossFileId?: string;
  ossPublicUrl?: string;
  ossUploading?: boolean;
  ossUploadError?: string;
  /** 本地上传/读取进度 0–100 */
  uploadProgress?: number;
};

export type VideoGeneration = {
  id: string;
  createdAt: number;
  model: string;
  prompt: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  taskId: string;
  status: VideoTaskStatus;
  progress?: number;
  videoUrl?: string;
  errorMessage?: string;
  /**
   * 轮询「问不到状态」时的软告警：与 errorMessage 分开存。
   * 进行中的条目只渲染等待态文案（progressHint 每次轮询重写 errorMessage），
   * 把软告警写进 errorMessage 会被下一轮直接覆盖、用户根本看不到。
   * 本字段只做提示，不改变 status —— 任务在服务端还在跑，UI 不能替它判死。
   */
  pollWarning?: string;
  responseRaw?: string;
  /**
   * @deprecated 历史遗留字段，只用于兼容旧 localStorage 数据。
   * 现在「视频能不能播」由页面内的探测状态（videoContentProbe）在运行时决定，
   * 不再落盘：播放失败可能只是瞬时抖动，写进存储会让一个本来还能播的视频
   * 在刷新后仍被标成「已过期」。加载时会统一清掉，不再写入新值。
   */
  isExpired?: boolean;
  /**
   * 后端下发的「当前可否取消」标记（GET /v1/videos/:id 的 metadata.can_cancel）。
   * 纯展示用途：只决定取消按钮显隐，与计费无关；每次轮询都会覆盖写入。
   */
  canCancel?: boolean;
  /**
   * 用户点过取消、且上游已拒绝（如 running 不支持删除）时写入的时间戳。
   * 与 canCancel 不同：canCancel 每次轮询都会被后端覆盖，无法可靠记住「已被拒」；
   * 本字段只在用户主动触发取消失败时写入一次，轮询不会触碰它，用于收起停止键，
   * 避免用户对同一个不可取消的任务反复点击。
   */
  cancelRejectedAt?: number;
  attachments: PendingAttachment[];
  genMode?: VideoGenMode;
};

export type VideoSession = {
  id: string;
  createdAt: number;
  title: string;
  generations: VideoGeneration[];
};

const STORAGE_KEY_PREFIX = 'lynxton_video_sessions_v1';
const LEGACY_VIDEO_HISTORY_PREFIX = 'lynxton_video_history_v1';

function getStorageKey(userId?: number) {
  return userId ? `${STORAGE_KEY_PREFIX}_u${userId}` : STORAGE_KEY_PREFIX;
}

function getLegacyStorageKey(userId?: number) {
  return userId ? `${LEGACY_VIDEO_HISTORY_PREFIX}_u${userId}` : LEGACY_VIDEO_HISTORY_PREFIX;
}

function migrateLegacyRowsToSessions(legacy: VideoGeneration[]): VideoSession[] {
  return legacy.map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    title: (item.prompt || '').trim().slice(0, 28) || '⋯',
    generations: [{ ...item }],
  }));
}

/** 仅内存：localStorage 不落盘 base64 时，同页仍可展示用户上传的预览 */
const attachmentPreviewMemoryCache = new Map<string, string>();

function attachmentPreviewCacheKey(generationId: string, attachmentId: string): string {
  return attachmentPreviewStoreKey(generationId, attachmentId);
}

/** 发送时写入，避免 persist strip 后同页预览丢失 */
export function rememberGenerationAttachmentPreviews(
  generationId: string,
  attachments: PendingAttachment[],
): void {
  for (const att of attachments) {
    const url = att.preview.trim();
    if (!url) continue;
    attachmentPreviewMemoryCache.set(attachmentPreviewCacheKey(generationId, att.id), url);
    if (url.startsWith('data:')) {
      void putAttachmentPreview(generationId, att.id, url);
    }
  }
}

/** 从 IndexedDB 恢复 strip 后的预览（刷新页面后仍可显示历史参考图） */
export async function warmAttachmentPreviewCacheFromSessions(sessions: VideoSession[]): Promise<boolean> {
  return hydrateAttachmentPreviewMemoryCache(sessions, attachmentPreviewMemoryCache);
}

function mergePendingAttachment(
  generationId: string,
  a: PendingAttachment,
  b: PendingAttachment,
): PendingAttachment {
  const urlA = resolveAttachmentDisplayUrl(generationId, a);
  const urlB = resolveAttachmentDisplayUrl(generationId, b);
  const richer = urlA.length >= urlB.length ? a : b;
  const other = richer === a ? b : a;
  const preview = richer.preview.trim() || other.preview.trim();
  return {
    ...other,
    ...richer,
    preview,
    ossPublicUrl: richer.ossPublicUrl?.trim() || other.ossPublicUrl?.trim() || undefined,
    ossFileId: richer.ossFileId || other.ossFileId,
  };
}

function mergeGenerationAttachments(
  generationId: string,
  a: VideoGeneration,
  b: VideoGeneration,
): PendingAttachment[] {
  const byId = new Map<string, PendingAttachment>();
  for (const att of b.attachments) byId.set(att.id, att);
  for (const att of a.attachments) {
    const prev = byId.get(att.id);
    byId.set(att.id, prev ? mergePendingAttachment(generationId, att, prev) : att);
  }
  return Array.from(byId.values());
}

/** 展示用 URL：公网 OSS > 内存缓存 > 持久化 preview */
export function resolveAttachmentDisplayUrl(
  generationId: string,
  att: PendingAttachment,
): string {
  const oss = att.ossPublicUrl?.trim();
  if (oss) return oss;
  const preview = att.preview.trim();
  if (preview) return preview;
  return attachmentPreviewMemoryCache.get(attachmentPreviewCacheKey(generationId, att.id)) ?? '';
}

function stripAttachmentForPersist(att: PendingAttachment): PendingAttachment {
  const url = att.preview.trim();
  const isDataUrl = url.startsWith('data:');
  const isHttp =
    url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/');
  let preview = '';
  if (!isDataUrl && isHttp) {
    preview = url;
  } else if (att.ossPublicUrl) {
    preview = att.ossPublicUrl;
  }
  return { ...att, preview };
}

function generationContentScore(g: VideoGeneration): number {
  let score = g.prompt.length + (g.responseRaw?.length ?? 0);
  for (const a of g.attachments) {
    score += resolveAttachmentDisplayUrl(g.id, a).length;
  }
  if (g.errorMessage) score += g.errorMessage.length;
  if (g.taskId) score += 8;
  if (g.videoUrl) score += 32;
  return score;
}

function generationStatusRank(status: VideoTaskStatus): number {
  switch (status) {
    case 'completed':
      return 4;
    case 'failed':
      return 3;
    case 'in_progress':
      return 2;
    case 'queued':
      return 1;
    default:
      return 0;
  }
}

function pickRicherGeneration(mem: VideoGeneration, ls: VideoGeneration): VideoGeneration {
  const attachments = mergeGenerationAttachments(
    generationContentScore(mem) >= generationContentScore(ls) ? mem.id : ls.id,
    mem,
    ls,
  );
  const memRank = generationStatusRank(mem.status);
  const lsRank = generationStatusRank(ls.status);
  if (memRank !== lsRank) {
    const pick = memRank > lsRank ? mem : ls;
    const other = pick === mem ? ls : mem;
    return {
      ...other,
      ...pick,
      attachments,
      videoUrl: pick.videoUrl || other.videoUrl,
      progress: Math.max(mem.progress ?? 0, ls.progress ?? 0) || pick.progress || other.progress,
      errorMessage: pick.status === 'completed' ? undefined : (pick.errorMessage || other.errorMessage),
      pollWarning: isTerminalStatus(pick.status) ? undefined : pick.pollWarning,
    };
  }
  const pick = generationContentScore(mem) >= generationContentScore(ls) ? mem : ls;
  const other = pick === mem ? ls : mem;
  return {
    ...other,
    ...pick,
    attachments,
    videoUrl: pick.videoUrl || other.videoUrl,
    progress: Math.max(mem.progress ?? 0, ls.progress ?? 0) || pick.progress || other.progress,
    // 同状态合并：pick 是按内容分出的，可能恰好是没带提示的那一份，回退取另一份
    pollWarning: isTerminalStatus(pick.status)
      ? undefined
      : (pick.pollWarning ?? other.pollWarning),
  };
}

/**
 * 终态：轮询软告警已无意义（任务不再推进），必须清掉，
 * 否则合并时会把旧提示带回已完成的任务上。
 */
function isTerminalStatus(status: VideoTaskStatus): boolean {
  return status === 'completed' || status === 'failed';
}

/** 落盘前去掉 base64 preview，避免 localStorage 超配额 */
export function stripVideoSessionsForPersist(sessions: VideoSession[]): VideoSession[] {
  return sessions.map((s) => ({
    ...s,
    generations: s.generations.map((g) => ({
      ...g,
      attachments: g.attachments.map(stripAttachmentForPersist),
    })),
  }));
}

export function loadVideoSessions(userId?: number): VideoSession[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0] as VideoSession & { generations?: unknown };
        if (first && Array.isArray(first.generations)) {
          return normalizeLoadedVideoSessions(
            (parsed as VideoSession[]).filter(
              (s) => s && typeof s.id === 'string' && Array.isArray(s.generations),
            ),
          );
        }
      }
    }
    const legacyRaw = localStorage.getItem(getLegacyStorageKey(userId));
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as VideoGeneration[];
    if (!Array.isArray(legacy)) return [];
    const gens = legacy.filter((item) => item && typeof item.id === 'string');
    return normalizeLoadedVideoSessions(migrateLegacyRowsToSessions(gens));
  } catch {
    return [];
  }
}

export function saveVideoSessions(items: VideoSession[], userId?: number): boolean {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function hydrateGenerationFromStoredResponse(g: VideoGeneration): VideoGeneration {
  // 旧版本把「这次探测失败」写成了 isExpired: true 落盘。播放失败大多是瞬时抖动，
  // 继续沿用会让视频明明还在却被永久标成「已过期」，所以入口先统一剔除，
  // 再走后面的补全逻辑（补全过程中也不能把它带回来）。
  const { isExpired: _legacyExpired, ...base } = g;
  if (base.status === 'failed' && base.errorMessage && isInterruptedFetchMessage(base.errorMessage)) {
    return { ...base, errorMessage: i18n.t('chat.taskInterrupted') };
  }
  let next: VideoGeneration = base;
  if (base.taskId && base.videoUrl && isPresignedObjectStorageUrl(base.videoUrl)) {
    next = {
      ...base,
      videoUrl: coercePlaybackVideoUrl(base.taskId, base.videoUrl),
    };
  }
  if (next.status === 'completed' && next.videoUrl) return next;
  const raw = next.responseRaw?.trim();
  if (!raw || !next.taskId) return next;
  try {
    const parsed = JSON.parse(raw) as Parameters<typeof parseVideoTaskApiPollResponse>[1];
    const patch = parseVideoTaskApiPollResponse(next.taskId, parsed, next);
    if (patch.status !== 'completed') return next;
    return { ...next, ...patch, errorMessage: undefined };
  } catch {
    return next;
  }
}

function normalizeLoadedVideoSessions(sessions: VideoSession[]): VideoSession[] {
  return sessions.map((s) => ({
    ...s,
    generations: s.generations.map(hydrateGenerationFromStoredResponse),
  }));
}

/** 页面刷新后：提交尚未拿到 taskId 的条目无法续跑，标记为中断 */
export function finalizeInterruptedVideoSessions(sessions: VideoSession[]): VideoSession[] {
  const interruptedText = i18n.t('chat.taskInterrupted');
  return sessions.map((s) => ({
    ...s,
    generations: s.generations.map((g) => {
      if (!g.taskId && g.status !== 'completed' && g.status !== 'failed') {
        return { ...g, status: 'failed' as const, errorMessage: interruptedText };
      }
      return g;
    }),
  }));
}

const listeners = new Set<() => void>();

export function subscribeVideoPersist(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emitVideoPersist(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

let suppressPersistSync = 0;

export function shouldSkipVideoPersistSync(): boolean {
  return suppressPersistSync > 0;
}

export function mergeVideoSessionsForMutation(mem: VideoSession[], ls: VideoSession[]): VideoSession[] {
  const byId = new Map<string, VideoSession>();
  for (const s of ls) byId.set(s.id, s);
  for (const s of mem) {
    const existing = byId.get(s.id);
    if (!existing) {
      byId.set(s.id, s);
      continue;
    }
    const gensById = new Map<string, VideoGeneration>();
    for (const g of existing.generations) gensById.set(g.id, g);
    for (const g of s.generations) {
      const prev = gensById.get(g.id);
      gensById.set(g.id, prev ? pickRicherGeneration(g, prev) : g);
    }
    const mergedGenerations = Array.from(gensById.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    const base = s.generations.length >= existing.generations.length ? s : existing;
    byId.set(s.id, { ...base, generations: mergedGenerations });
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function runVideoSessionMutation(
  userId: number | undefined,
  mutator: (prev: VideoSession[]) => VideoSession[],
  memSnapshot?: VideoSession[],
): { next: VideoSession[]; persistOk: boolean } {
  return mutateSessionList({
    memSnapshot,
    load: () => loadVideoSessions(userId),
    merge: mergeVideoSessionsForMutation,
    stripForPersist: stripVideoSessionsForPersist,
    save: (items) => saveVideoSessions(items, userId),
    emitPersist: emitVideoPersist,
    mutator,
    onSuppressSync: {
      enter: () => {
        suppressPersistSync += 1;
      },
      exit: () => {
        suppressPersistSync -= 1;
      },
    },
  });
}

export type PendingGenerationRef = { sessionId: string; generation: VideoGeneration };

export function listPendingVideoGenerations(userId?: number): PendingGenerationRef[] {
  const pairs: PendingGenerationRef[] = [];
  for (const s of loadVideoSessions(userId)) {
    for (const g of s.generations) {
      if (g.taskId && g.status !== 'completed' && g.status !== 'failed') {
        pairs.push({ sessionId: s.id, generation: g });
      }
    }
  }
  return pairs;
}

export function updateVideoGenerationInStorage(
  userId: number | undefined,
  sessionId: string,
  generationId: string,
  updater: (g: VideoGeneration) => VideoGeneration,
  memSnapshot?: VideoSession[],
): { next: VideoSession[]; persistOk: boolean } {
  return runVideoSessionMutation(
    userId,
    (prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          generations: s.generations.map((g) =>
            g.id === generationId ? updater(g) : g,
          ),
        };
      }),
    memSnapshot,
  );
}

export function genVideoSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createBlankVideoSession(title: string): VideoSession {
  return {
    id: genVideoSessionId(),
    createdAt: Date.now(),
    title,
    generations: [],
  };
}
