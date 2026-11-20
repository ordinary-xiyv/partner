/** Lynx 网关在线播放地址（服务端代读 OSS，不依赖短时预签名）。 */
export function lynxVideoContentPath(taskId: string): string {
  return `/v1/videos/${encodeURIComponent(taskId)}/content`;
}

/**
 * 识别 OSS / 对象存储预签名直链（仅适合短时下载，不宜作为页面长期 src）。
 * 在线播放应使用 {@link lynxVideoContentPath}。
 */
export function isPresignedObjectStorageUrl(url: string): boolean {
  const u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  const lower = u.toLowerCase();
  if (
    lower.includes('aliyuncs.com')
    || lower.includes('volces.com')
    || lower.includes('myqcloud.com')
    || lower.includes('amazonaws.com')
  ) {
    return true;
  }
  if (lower.includes('ossaccesskeyid=') || lower.includes('x-tos-algorithm=')) {
    return true;
  }
  if (lower.includes('signature=') && lower.includes('expires=')) {
    return true;
  }
  return false;
}

/** 将历史落盘的预签名播放地址纠正为网关 /content。 */
export function coercePlaybackVideoUrl(taskId: string, videoUrl: string | undefined): string {
  const fallback = lynxVideoContentPath(taskId);
  const raw = typeof videoUrl === 'string' ? videoUrl.trim() : '';
  if (!raw || isPresignedObjectStorageUrl(raw)) return fallback;
  return raw;
}

/** 从 GET /v1/videos/:id 响应解析已完成任务的播放地址（含 Lynx OSS 元数据）。 */
export function resolveCompletedVideoUrl(
  taskId: string,
  parsed: {
    url?: unknown;
    metadata?: {
      lynx_output_url?: unknown;
      url?: unknown;
      lynx_output_download_url?: unknown;
      out_download_url?: unknown;
    };
  },
): string {
  const fallback = lynxVideoContentPath(taskId);
  const meta = parsed.metadata;
  // 预签名 download_url 仅用于短时直链下载，在线播放统一走网关 /content。
  if (meta) {
    const lynx = meta.lynx_output_url ?? meta.url;
    if (typeof lynx === 'string' && lynx.trim()) {
      return coercePlaybackVideoUrl(taskId, lynx.trim());
    }
  }
  if (typeof parsed.url === 'string' && parsed.url.trim()) {
    return coercePlaybackVideoUrl(taskId, parsed.url.trim());
  }
  return fallback;
}
