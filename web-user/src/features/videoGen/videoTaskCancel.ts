/**
 * 取消视频生成任务：DELETE /v1/videos/:task_id。
 *
 * 这一层只负责发请求与把结果翻译成前端可读文案，**不参与任何计费判断**。
 * 退款与否完全由服务端决定：服务端先 CAS 抢占状态、再发上游 DELETE，
 * 只有上游确认成功才把任务置为失败并退款；上游拒绝则回滚状态、不动钱。
 * 因此前端只区分「成功 / 失败」两种结果，不读服务端的计费信息、不做任何本地推算。
 */

export type VideoTaskCancelOutcome =
  | {
      /**
       * 服务端已确认删除。
       * 成功响应只回一个 ID 字段（v1 回 task_id、v3 回 cgt_id），
       * 不携带 refunded / status 等计费与状态信息，前端不做任何本地推算。
       */
      ok: true;
    }
  | {
      ok: false;
      /** 服务端返回的原始错误码，供调用方按需区分展示 */
      code?: string;
      /** 已本地化、可直接展示的错误文案 */
      message: string;
      /** 该任务是否已不再允许取消（用于立刻收起按钮，避免用户重复点击） */
      shouldHideButton: boolean;
    };

/**
 * 表示「当前状态下不能再取消」的错误码，前端应立刻收起按钮。
 *
 * 服务端错误码分两类（2026-11 对齐火山官方后）：
 * - 网关自身准入约束（渠道未开删除开关、适配器不支持、本地并发冲突）：
 *   火山官方没有这些概念，仍是 task_delete_* 自有码。
 * - 上游真实拒绝（任务不存在、参数非法等）：直接透传官方 error.code，
 *   即 ResourceNotFound / InvalidParameter 这类命名空间。
 */
const HIDE_BUTTON_CODES = new Set([
  'task_delete_invalid_status',
  'task_delete_conflict',
  'task_delete_not_supported_by_channel',
  'task_delete_not_supported_by_upstream',
  // 官方命名空间（上游直接返回）
  'ResourceNotFound',
  'InvalidParameter',
]);

type CancelMessages = {
  /** 兜底失败文案 */
  failed: string;
  /** 服务端未给出可读文案时的网络/解析失败文案 */
  networkFailed: string;
  /** 按服务端错误码覆盖文案（可选，未命中则用服务端 message） */
  byCode?: Record<string, string>;
};

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const v = source[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export async function cancelVideoTask(
  taskId: string,
  tokenKey: string,
  messages: CancelMessages,
): Promise<VideoTaskCancelOutcome> {
  let resp: Response;
  try {
    resp = await fetch(`/v1/videos/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenKey}` },
    });
  } catch {
    return { ok: false, message: messages.networkFailed, shouldHideButton: false };
  }

  const raw = await resp.text();

  if (!resp.ok) {
    let code: string | undefined;
    let message: string | undefined;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      code = readString(parsed, 'code');
      message = readString(parsed, 'message');
      // 部分错误体把详情放在 error 字段下
      if (!message && parsed.error && typeof parsed.error === 'object') {
        const err = parsed.error as Record<string, unknown>;
        code = code ?? readString(err, 'code');
        message = readString(err, 'message');
      }
    } catch {
      /* 非 JSON 响应：走兜底文案 */
    }
    const mapped = code && messages.byCode ? messages.byCode[code] : undefined;
    return {
      ok: false,
      code,
      message: mapped ?? message ?? messages.failed,
      shouldHideButton: Boolean(code && HIDE_BUTTON_CODES.has(code)),
    };
  }

  // 服务端约定：2xx 只代表「已确认删除」，响应体仅一个 ID 字段。
  // 因此不解析响应体，拿到 2xx 即视为成功。
  return { ok: true };
}
