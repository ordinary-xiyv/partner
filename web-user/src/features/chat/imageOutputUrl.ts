import { getStorageFileDownloadUrl } from '../../api';
import { isPresignedObjectStorageUrl } from '../videoGen/videoOutputUrl';

export { isPresignedObjectStorageUrl };

/** Lynx 输出图 object key：.../media/{userId}/outputs/{year}/{month}/{fileId}{ext} */
const LYNX_OUTPUT_IMAGE_FILE_ID_RE =
  /\/media\/\d+\/outputs\/\d{4}\/\d{1,2}\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+$/i;

/** 从转存后的 OSS/TOS 预签名 URL 解析 storage file_id */
export function extractLynxOutputImageFileId(url: string): string | undefined {
  const raw = url.trim();
  if (!raw) return undefined;
  try {
    const path = decodeURIComponent(new URL(raw).pathname);
    const m = path.match(LYNX_OUTPUT_IMAGE_FILE_ID_RE);
    return m?.[1];
  } catch {
    return undefined;
  }
}

/** 预签名是否已过期或即将过期（默认提前 60s） */
export function isOssPresignedExpiredOrExpiringSoon(url: string, skewSec = 60): boolean {
  try {
    const u = new URL(url.trim());
    const expRaw = u.searchParams.get('Expires') || u.searchParams.get('expires');
    if (!expRaw) return true;
    const expSec = Number(expRaw);
    if (!Number.isFinite(expSec)) return true;
    return Date.now() / 1000 >= expSec - skewSec;
  } catch {
    return true;
  }
}

/**
 * 历史会话里的短时 OSS 预签名不宜直接当长期 src。
 * 有 file_id（对话附图）或能从 outputs 路径解析时，过期则调 download-url 换新签名。
 */
export async function resolveFreshImageSrc(url: string, fileId?: string): Promise<string> {
  const raw = url.trim();
  const id = fileId?.trim() || extractLynxOutputImageFileId(raw);
  if (!id) return raw;
  if (
    raw
    && !raw.startsWith('data:')
    && isPresignedObjectStorageUrl(raw)
    && !isOssPresignedExpiredOrExpiringSoon(raw)
  ) {
    return raw;
  }

  try {
    const res = await getStorageFileDownloadUrl(id);
    const next = res.data?.data?.url?.trim();
    return next || raw;
  } catch {
    return raw;
  }
}
