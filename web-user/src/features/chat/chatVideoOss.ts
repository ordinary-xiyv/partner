import API from '../../api';

// Historical chat messages stored only a URL. The default public input key
// contains the storage file ID, which lets those messages refresh after a move.
const LEGACY_VIDEO_FILE_ID_RE =
  /\/public\/gen-input\/\d+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

export function chatVideoFileId(url: string, fileId?: string): string | undefined {
  if (fileId?.trim()) return fileId.trim();
  try {
    return decodeURIComponent(new URL(url).pathname).match(LEGACY_VIDEO_FILE_ID_RE)?.[1];
  } catch {
    return undefined;
  }
}

export async function resolveFreshChatVideoSrc(url: string, fileId?: string): Promise<string> {
  const id = chatVideoFileId(url, fileId);
  if (!id) return url;
  try {
    const res = await API.get<{
      success: boolean;
      data?: { public_url?: string };
    }>(`/api/lynx/gen-media/files/${encodeURIComponent(id)}/public-url`);
    return res.data?.success && res.data.data?.public_url?.trim()
      ? res.data.data.public_url.trim()
      : url;
  } catch {
    return url;
  }
}
