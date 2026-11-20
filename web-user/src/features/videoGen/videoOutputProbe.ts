/**
 * 视频输出可播性探测：GET /v1/videos/:task_id/content
 *
 * 设计原则：**不确定就不下结论**。
 * 只有拿到确凿证据（上游明确报告输出转存永久失败、或任务在库中不存在）才判定「不可用」，
 * 其余一切失败都归为「可重试」，绝不允许一次瞬时故障把任务钉死成过期态——
 * 那会让用户误以为要重新生成，白扣一次钱。
 *
 * 后端 /content 的状态码来源（见 controller/video_proxy.go、genmedia/output_gate.go）：
 *   400  任务尚未完成（Task is not completed yet）        -> 等一会儿再来
 *  403  SSRF 拦截 / 无权访问                             -> 配置或权限问题，不是过期
 *  404  任务在库中不存在                                  -> 确凿
 *  502  OSS 读取失败 / 回源拉流失败 / Gemini URL 解析失败  -> 瞬时
 *  503  output_processing（正在转存 OSS）                -> 等一会儿再来
 *  502  output_storage_failed（转存重试次数耗尽）         -> 确凿失败
 */

export type VideoOutputProbeOutcome =
  /** 可播放 */
  | { kind: 'ok' }
  /** 输出还在转存、或任务刚完成尚未就绪：稍等即可，不是错误 */
  | { kind: 'pending'; message?: string }
  /** 瞬时故障（5xx / 网络 / 权限配置）：可重试，不能下“过期”结论 */
  | { kind: 'retry'; message?: string }
  /** 确凿不可用（上游明确报告输出转存永久失败） */
  | { kind: 'unavailable'; message?: string }
  /** 任务在库中不存在（已被清理或 ID 失效） */
  | { kind: 'not_found'; message?: string };

/** 输出还在转存中：后端明确表示「请稍后重试」，属于正常中间态 */
const PENDING_CODES = new Set(['output_processing', 'output_pending']);

/** 输出转存永久失败：后端已重试耗尽，属于确凿结论 */
const UNAVAILABLE_CODES = new Set(['output_storage_failed', 'output_expired']);

/** 任务尚未完成 / 冲突：等状态推进后再探 */
const PENDING_STATUS = new Set([400, 409, 503]);

function readErrorFields(parsed: Record<string, unknown>): { code?: string; message?: string } {
  const pick = (obj: Record<string, unknown>) => {
    const code = typeof obj.code === 'string' ? obj.code.trim() : undefined;
    const message = typeof obj.message === 'string' ? obj.message.trim() : undefined;
    return { code: code || undefined, message: message || undefined };
  };
  const err = parsed.error;
  if (err && typeof err === 'object') {
    const fromErr = pick(err as Record<string, unknown>);
    if (fromErr.code || fromErr.message) return fromErr;
  }
  return pick(parsed);
}

export async function probeVideoOutput(
  taskId: string,
  tokenKey: string,
): Promise<VideoOutputProbeOutcome> {
  let resp: Response;
  try {
    resp = await fetch(`/v1/videos/${encodeURIComponent(taskId)}/content`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenKey}`,
        // 只要 1 字节：目的仅是确认输出可读，不下载整个视频
        Range: 'bytes=0-0',
      },
    });
  } catch {
    // 断网 / 请求被中断：明确是瞬时问题
    return { kind: 'retry' };
  }

  if (resp.ok) {
    void resp.body?.cancel().catch(() => {});
    return { kind: 'ok' };
  }

  const status = resp.status;
  let code: string | undefined;
  let message: string | undefined;
  try {
    const raw = await resp.text();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const fields = readErrorFields(parsed);
      code = fields.code;
      message = fields.message;
    }
  } catch {
    /* 非 JSON 错误体：只依据状态码分级 */
  }

  // 错误码优先于状态码：同一状态码下语义可能完全不同
  // （例如 502 既可能是 OSS 抖动，也可能是转存永久失败）
  if (code && UNAVAILABLE_CODES.has(code)) return { kind: 'unavailable', message };
  if (code && PENDING_CODES.has(code)) return { kind: 'pending', message };

  if (status === 404) return { kind: 'not_found', message };
  if (PENDING_STATUS.has(status)) return { kind: 'pending', message };
  if (status === 403) {
    // SSRF / 权限问题：重试未必能好，但绝不是「视频过期」，不能引导用户重新生成
    return { kind: 'retry', message };
  }
  return { kind: 'retry', message };
}

/** 探测重试节奏：输出转存通常在几十秒内完成，给足但不无限等 */
export const PROBE_RETRY_DELAYS_MS = [2000, 4000, 8000, 15000, 30000];
