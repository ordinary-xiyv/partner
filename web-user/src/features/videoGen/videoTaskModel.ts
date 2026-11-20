/** 视频任务气泡与 /v1/videos API 共用的类型与序列化 */

import { formatRelayApiErrorBody } from '../../lib/formatRelayApiError';
import { resolveCompletedVideoUrl } from './videoOutputUrl';

export type VideoTaskStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'unknown';

export interface VideoTaskPayload {
  taskId: string;
  model?: string;
  status: VideoTaskStatus;
  progress?: number;
  videoUrl?: string;
  errorMessage?: string;
  /**
   * 后端下发的「当前可否取消」标记（取自 GET /v1/videos/:id 的 metadata.can_cancel）。
   * 纯展示用途：只决定取消按钮的显隐，与计费无关。
   * 每次轮询都会刷新，因此按钮会随任务进入生成阶段自动收起。
   */
  canCancel?: boolean;
}

export const VIDEO_TASK_PREFIX = '__video_task__:';

export function encodeVideoTaskPayload(payload: VideoTaskPayload): string {
  return `${VIDEO_TASK_PREFIX}${JSON.stringify(payload)}`;
}

export function parseVideoTaskPayload(content: string): VideoTaskPayload | null {
  if (!content.startsWith(VIDEO_TASK_PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(VIDEO_TASK_PREFIX.length)) as VideoTaskPayload;
    if (!parsed?.taskId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** GET /v1/videos/:id 响应体（OpenAI 兼容 + 豆包/ Lynx 扩展字段） */
export interface VideoTaskApiResponse {
  status?: string;
  progress?: number;
  model?: string;
  url?: string;
  error?: { message?: string; code?: string };
  metadata?: {
    url?: string;
    lynx_output_url?: string;
    lynx_output_download_url?: string;
    out_download_url?: string;
    lynx_output_ready?: boolean;
    output_status?: string;
    /** 当前任务是否可被取消（后端按渠道开关 + 上游能力 + 本地状态计算） */
    can_cancel?: boolean;
  };
}

export function isVideoTaskApiSucceeded(parsed: VideoTaskApiResponse): boolean {
  const raw = (parsed.status ?? '').trim().toLowerCase();
  if (raw === 'completed' || raw === 'succeeded' || raw === 'success') return true;
  const meta = parsed.metadata;
  if (meta?.lynx_output_ready === true) return true;
  if (typeof meta?.output_status === 'string' && meta.output_status.trim().toLowerCase() === 'ready') {
    return true;
  }
  return false;
}

export function isVideoTaskApiFailed(parsed: VideoTaskApiResponse): boolean {
  const raw = (parsed.status ?? '').trim().toLowerCase();
  return raw === 'failed' || raw === 'cancelled' || raw === 'expired';
}

/** 将上游 status 映射为前端 VideoTaskStatus */
export function normalizeVideoTaskApiStatus(rawStatus: string | undefined): VideoTaskStatus {
  const raw = (rawStatus ?? '').trim().toLowerCase();
  if (raw === 'queued' || raw === 'pending' || raw === 'submitted') return 'queued';
  if (isVideoTaskApiFailed({ status: raw })) return 'failed';
  if (isVideoTaskApiSucceeded({ status: raw })) return 'completed';
  if (raw === 'in_progress' || raw === 'running' || raw === 'processing') return 'in_progress';
  return 'unknown';
}

export interface VideoTaskPollPatch {
  model?: string;
  status: VideoTaskStatus;
  progress?: number;
  videoUrl?: string;
  errorMessage?: string;
  /** 只有排队阶段才可能为 true；终态与生成中一律 false */
  canCancel?: boolean;
}

/** 将轮询响应合并为前端任务状态（VideoGen / Chat 共用） */
export function parseVideoTaskApiPollResponse(
  taskId: string,
  parsed: VideoTaskApiResponse,
  current: Pick<VideoTaskPayload, 'model' | 'progress' | 'errorMessage'>,
): VideoTaskPollPatch {
  if (isVideoTaskApiSucceeded(parsed)) {
    return {
      model: parsed.model || current.model,
      status: 'completed',
      progress: 100,
      videoUrl: resolveCompletedVideoUrl(taskId, parsed),
      errorMessage: undefined,
      // 已出片：不可能再取消，强制收起按钮，避免后端字段滞后导致误显示。
      canCancel: false,
    };
  }
  if (isVideoTaskApiFailed(parsed)) {
    return {
      model: parsed.model || current.model,
      status: 'failed',
      progress: typeof parsed.progress === 'number' ? parsed.progress : current.progress,
      videoUrl: undefined,
      errorMessage: parsed.error?.message ?? current.errorMessage,
      canCancel: false,
    };
  }
  const status = normalizeVideoTaskApiStatus(parsed.status);
  return {
    model: parsed.model || current.model,
    status: status === 'unknown' ? 'in_progress' : status,
    progress: typeof parsed.progress === 'number' ? parsed.progress : current.progress,
    videoUrl: undefined,
    errorMessage: current.errorMessage,
    canCancel: parsed.metadata?.can_cancel === true,
  };
}

export const VIDEO_DURATION_MIN_SEC = 4;
export const VIDEO_DURATION_MAX_SEC = 60;
/** 草稿为空/非法时的默认时长（全局下限已放宽到 4s 以支持 seedance2.5，默认值维持 5s） */
export const VIDEO_DURATION_DEFAULT_SEC = 5;
/** 与 Chat 共用 localStorage key，时长在两页一致 */
export const VIDEO_DURATION_STORAGE_KEY = 'chat.videoGenDurationSec';

export function clampVideoDurationSec(n: number): number {
  if (!Number.isFinite(n)) return VIDEO_DURATION_DEFAULT_SEC;
  return Math.min(VIDEO_DURATION_MAX_SEC, Math.max(VIDEO_DURATION_MIN_SEC, Math.round(n)));
}

export function parseVideoDurationDraft(draft: string): number {
  const t = draft.trim();
  if (t === '') return VIDEO_DURATION_DEFAULT_SEC;
  const n = Number.parseInt(t, 10);
  if (Number.isNaN(n)) return VIDEO_DURATION_DEFAULT_SEC;
  return clampVideoDurationSec(n);
}

export function loadVideoGenDurationSec(): number {
  try {
    const raw = localStorage.getItem(VIDEO_DURATION_STORAGE_KEY);
    if (raw == null) return VIDEO_DURATION_DEFAULT_SEC;
    const n = Number.parseInt(raw, 10);
    return clampVideoDurationSec(n);
  } catch {
    return VIDEO_DURATION_DEFAULT_SEC;
  }
}

/** 从网关错误体解析为当前语言的展示文案（见 formatRelayApiError） */
export function parseRelayApiErrorBody(status: number, bodyText: string): string {
  return formatRelayApiErrorBody(status, bodyText);
}

/** 从 /v1/videos 等返回体中解析「最内层」供应商错误（支持 message 为 JSON 字符串的嵌套结构） */
export interface ExtractedVideoApiError {
  topLevelCode?: string;
  topLevelMessage?: string;
  providerCode?: string;
  providerMessage?: string;
}

export function extractVideoTaskApiError(bodyText: string): ExtractedVideoApiError | null {
  const raw = bodyText.trim();
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const out: ExtractedVideoApiError = {};
    if (typeof j.code === 'string') out.topLevelCode = j.code;
    if (typeof j.message === 'string') out.topLevelMessage = j.message;

    const fromErrorField = (err: unknown) => {
      if (!err || typeof err !== 'object') return;
      const e = err as Record<string, unknown>;
      if (typeof e.code === 'string') out.providerCode = e.code;
      if (typeof e.message === 'string') out.providerMessage = e.message;
    };
    fromErrorField(j.error);

    const tryParseMessageJson = (msg: string | undefined) => {
      const m = msg?.trim();
      if (!m || !m.startsWith('{')) return;
      try {
        const inner = JSON.parse(m) as Record<string, unknown>;
        fromErrorField(inner.error);
        if (!out.providerCode && typeof inner.code === 'string') out.providerCode = inner.code as string;
        if (!out.providerMessage && typeof inner.message === 'string') out.providerMessage = inner.message as string;
      } catch {
        /* ignore */
      }
    };
    tryParseMessageJson(out.topLevelMessage);
    return out;
  } catch {
    return null;
  }
}

/** 用户消息多模态片段（与 Chat 一致） */
export type ChatUserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string }; file_id?: string }
  | { type: 'video_url'; video_url: { url: string }; file_id?: string };
