const DURATION_PROVIDER_ERR_RE = /duration should be at least ([\d.]+)s,?\s*got ([\d.]+)s/i;

export type VideoProviderErrorMessages = {
  sensitive: string;
  fallback: string;
  durationTooShort: (minSec: number, actualSec: number) => string;
};

function matchDurationProviderError(message: string): { min: number; actual: number } | null {
  const m = DURATION_PROVIDER_ERR_RE.exec(message);
  if (!m) return null;
  return { min: parseFloat(m[1]), actual: parseFloat(m[2]) };
}

/** 将上游 / 网关视频任务错误转为用户可读文案 */
export function friendlyVideoProviderError(
  error: { message?: string; code?: string } | undefined,
  messages: VideoProviderErrorMessages,
): string {
  const code = (error?.code || '').trim();
  let message = (error?.message || '').trim();
  if (code === 'OutputVideoSensitiveContentDetected' || /sensitive information/i.test(message)) {
    return messages.sensitive;
  }
  let duration = matchDurationProviderError(message);
  if (!duration) {
    const withoutUrl = message.replace(/^https?:\/\/\S+\s+/i, '').trim();
    if (withoutUrl !== message) {
      duration = matchDurationProviderError(withoutUrl);
      if (duration) {
        return messages.durationTooShort(duration.min, duration.actual);
      }
      if (withoutUrl) message = withoutUrl;
    }
  } else {
    return messages.durationTooShort(duration.min, duration.actual);
  }
  if (message) return message;
  return messages.fallback;
}
