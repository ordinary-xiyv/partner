/** 刷新 / 停止 / 断网导致 fetch 被掐断时的前端提示（不续跑生成） */

export function isInterruptedFetchMessage(message: string): boolean {
  const stripped = message.trim().replace(/^error:\s*/i, '').toLowerCase();
  if (!stripped) return false;
  return (
    stripped === 'failed to fetch'
    || stripped.includes('failed to fetch')
    || stripped.includes('networkerror')
    || stripped === 'network error'
    || stripped.includes('load failed')
    || stripped.includes('the user aborted')
    || stripped === 'cancelled'
    || stripped === 'canceled'
  );
}

export function isInterruptedFetchError(err: unknown): boolean {
  if (typeof err === 'string') return isInterruptedFetchMessage(err);
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError') return true;
  return isInterruptedFetchMessage(err.message);
}

export function replyContentFromGenerationError(
  err: unknown,
  accumulated: string,
  interruptedText: string,
): { isError: boolean; content: string } {
  const current = accumulated.trim();
  if (current && !isInterruptedFetchMessage(current)) {
    return { isError: true, content: accumulated };
  }
  if (isInterruptedFetchError(err)) {
    return { isError: true, content: interruptedText };
  }
  if (err instanceof Error && err.message.trim()) {
    return { isError: true, content: `Error: ${err.message}` };
  }
  return { isError: true, content: interruptedText };
}

export function replaceFailedFetchAssistantContent<
  T extends {
    role?: string;
    content?: unknown;
    streaming?: boolean;
    isError?: boolean;
  },
>(msg: T, interruptedText: string): T {
  if (msg.role !== 'assistant') return msg;
  const raw = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (raw && isInterruptedFetchMessage(raw)) {
    return { ...msg, streaming: false, isError: true, content: interruptedText };
  }
  return msg;
}

export function finalizeInterruptedAssistantMessage<
  T extends {
    role?: string;
    content?: unknown;
    streaming?: boolean;
    isError?: boolean;
  },
>(msg: T, interruptedText: string): T {
  const replaced = replaceFailedFetchAssistantContent(msg, interruptedText);
  if (replaced.role !== 'assistant' || !replaced.streaming) return replaced;
  const raw = typeof replaced.content === 'string' ? replaced.content.trim() : '';
  if (!raw) {
    return { ...replaced, streaming: false, isError: true, content: interruptedText };
  }
  return { ...replaced, streaming: false, isError: true };
}
