import { parseVideoTaskApiPollResponse, type VideoTaskApiResponse } from '../../features/videoGen/videoTaskModel';
import { friendlyVideoProviderError } from '../../features/videoGen/videoProviderError';
import {
  listPendingVideoGenerations,
  updateVideoGenerationInStorage,
  type VideoGeneration,
  type VideoSession,
} from './videoGenSession';

export const VIDEO_POLL_INTERVAL_MS = 10000;

export type VideoGenPollMessages = {
  payloadTooLarge: string;
  sensitiveContent: string;
  statusFailed: string;
  emptyResponse: string;
  durationTooShort: (minSec: number, actualSec: number) => string;
  /** 任务在服务端已不存在（404）：这是确凿的终态 */
  taskMissing: string;
  /** 鉴权失败（401/403）：任务可能仍在跑，不能判死 */
  authFailed: string;
  /** 连续多次查询失败后的提示：任务仍在服务端继续，只是暂时问不到 */
  pollUnstable: string;
};

type PollContext = {
  userId?: number;
  getTokenKey: () => string | null;
  /** 与页面内存合并后再落盘，避免 LS 旧数据覆盖新 generation */
  getMemSnapshot?: () => VideoSession[];
  messages: VideoGenPollMessages;
  /**
   * 进行中提示文案：按状态区分排队与生成中，避免 running 阶段仍显示「排队中」。
   * 不接收 taskId —— 任务 ID 由卡片底部的元信息行统一展示，正文不再重复拼接。
   */
  queueHint: (status: 'queued' | 'in_progress') => string;
  onQuotaRefresh?: () => Promise<void>;
};

let pollContext: PollContext | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const retryingTaskIds = new Set<string>();

/** 连续查询失败多少次后，才把「问不到」的告警显示给用户（约 1 分钟） */
const POLL_FAILURE_NOTICE_THRESHOLD = 6;

/**
 * 各任务连续轮询失败次数。
 * 单次失败绝不能让任务变成终态：视频是重计费长任务，中途一次 502/断网
 * 就把 UI 判死，用户会以为要重新生成并再付一次钱，而服务端其实还在跑。
 */
const pollFailureCounts = new Map<string, number>();

async function pollTaskOnceInStorage(
  ctx: PollContext,
  sessionId: string,
  item: VideoGeneration,
): Promise<void> {
  const tokenKey = ctx.getTokenKey();
  if (!tokenKey || !item.taskId || retryingTaskIds.has(item.taskId)) return;
  retryingTaskIds.add(item.taskId);
  try {
    const resp = await fetch(`/v1/videos/${encodeURIComponent(item.taskId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenKey}` },
    });
    const raw = await resp.text();
    if (!resp.ok) {
      const isMissing = resp.status === 404;
      const isAuth = resp.status === 401 || resp.status === 403;
      const failures = (pollFailureCounts.get(item.taskId) ?? 0) + 1;
      pollFailureCounts.set(item.taskId, failures);

      // 只有「服务端确认任务不存在」才是确凿终态；其余一律保留原状态继续轮询，
      // 让状态有机会自愈（这是本轮修复的核心）。
      if (isMissing) {
        // 终态：计数与软告警都不再需要，一并清掉避免残留到下一轮合并里
        pollFailureCounts.delete(item.taskId);
        updateVideoGenerationInStorage(
          ctx.userId,
          sessionId,
          item.id,
          (old) => ({
            ...old,
            status: 'failed',
            errorMessage: ctx.messages.taskMissing,
            pollWarning: undefined,
            responseRaw: raw,
            canCancel: false,
          }),
          ctx.getMemSnapshot?.(),
        );
        return;
      }

      updateVideoGenerationInStorage(
        ctx.userId,
        sessionId,
        item.id,
        (old) => ({
          ...old,
          // 状态保持不动：任务在服务端仍在推进，UI 不能替它宣判失败。
          // 提示写 pollWarning：进行中的条目只渲染等待文案，写 errorMessage 会被覆盖掉。
          pollWarning: isAuth
            ? ctx.messages.authFailed
            : failures >= POLL_FAILURE_NOTICE_THRESHOLD
              ? ctx.messages.pollUnstable
              : old.pollWarning,
          responseRaw: raw,
        }),
        ctx.getMemSnapshot?.(),
      );
      return;
    }

    // 查询成功：清零失败计数
    pollFailureCounts.delete(item.taskId);
    try {
      const parsed = JSON.parse(raw) as VideoTaskApiResponse & { error?: { message?: string; code?: string } };
      const wasCompleted = item.status === 'completed';
      const patch = parseVideoTaskApiPollResponse(item.taskId, parsed, item);
      updateVideoGenerationInStorage(
        ctx.userId,
        sessionId,
        item.id,
        (old) => {
          if (patch.status === 'completed') {
            return {
              ...old,
              status: 'completed',
              progress: 100,
              videoUrl: patch.videoUrl,
              errorMessage: undefined,
              pollWarning: undefined,
              responseRaw: raw,
              canCancel: false,
            };
          }
          if (patch.status === 'failed') {
            return {
              ...old,
              status: 'failed',
              progress: patch.progress ?? old.progress,
              errorMessage: friendlyVideoProviderError(parsed.error, {
                sensitive: ctx.messages.sensitiveContent,
                fallback: ctx.messages.statusFailed,
                durationTooShort: ctx.messages.durationTooShort,
              }),
              pollWarning: undefined,
              responseRaw: raw,
              canCancel: false,
            };
          }
          const nextStatus = patch.status === 'queued' ? 'queued' : 'in_progress';
          return {
            ...old,
            status: nextStatus,
            progress: patch.progress ?? old.progress,
            errorMessage: ctx.queueHint(nextStatus),
            pollWarning: undefined,
            responseRaw: raw,
            canCancel: patch.canCancel === true,
          };
        },
        ctx.getMemSnapshot?.(),
      );
      if (patch.status === 'completed' && !wasCompleted) {
        try {
          await ctx.onQuotaRefresh?.();
        } catch {
          /* ignore */
        }
      }
    } catch {
      // 响应体解析失败（2xx 但不是合法 JSON）：同样不判死。
      // 服务端任务本身没有失败，只是这次读不出来，保留状态等下一轮。
      const failures = (pollFailureCounts.get(item.taskId) ?? 0) + 1;
      pollFailureCounts.set(item.taskId, failures);
      updateVideoGenerationInStorage(
        ctx.userId,
        sessionId,
        item.id,
        (old) => ({
          ...old,
          pollWarning: failures >= POLL_FAILURE_NOTICE_THRESHOLD
            ? ctx.messages.pollUnstable
            : old.pollWarning,
          responseRaw: raw,
        }),
        ctx.getMemSnapshot?.(),
      );
    }
  } finally {
    retryingTaskIds.delete(item.taskId);
  }
}

export async function runVideoGenPollCycle(): Promise<void> {
  const ctx = pollContext;
  if (!ctx?.getTokenKey()) return;
  const pairs = listPendingVideoGenerations(ctx.userId);
  await Promise.all(pairs.map(({ sessionId, generation }) => pollTaskOnceInStorage(ctx, sessionId, generation)));
  rescheduleVideoGenBackgroundPoll();
}

export function rescheduleVideoGenBackgroundPoll(): void {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  const ctx = pollContext;
  if (!ctx) return;
  const pending = listPendingVideoGenerations(ctx.userId);
  if (pending.length === 0 || !ctx.getTokenKey()) return;
  pollTimer = window.setInterval(() => {
    void runVideoGenPollCycle();
  }, VIDEO_POLL_INTERVAL_MS);
}

export function setVideoGenPollContext(ctx: PollContext | null): void {
  pollContext = ctx;
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!ctx) return;
  const pending = listPendingVideoGenerations(ctx.userId);
  if (pending.length > 0 && ctx.getTokenKey()) {
    void runVideoGenPollCycle();
    rescheduleVideoGenBackgroundPoll();
  }
}
