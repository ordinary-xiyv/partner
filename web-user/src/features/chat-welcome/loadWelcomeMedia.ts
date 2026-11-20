import type { WelcomeMediaRef } from '../../components/chat-welcome';

/** 将静态资源 URL 转为 data URL，供 composer 附件 preview 使用 */
export async function resolveWelcomeMediaDataUrl(src: string): Promise<string> {
  const trimmed = src.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;

  const res = await fetch(trimmed);
  if (!res.ok) {
    throw new Error(`fetch welcome media failed: ${res.status}`);
  }
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('read welcome media failed'));
    reader.readAsDataURL(blob);
  });
}

export async function fetchWelcomeMediaAsFile(
  ref: WelcomeMediaRef,
  fallbackMime: string,
): Promise<File> {
  const res = await fetch(ref.src);
  if (!res.ok) {
    throw new Error(`fetch welcome media failed: ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error('welcome media is empty');
  }
  const type = fallbackMime || 'application/octet-stream';
  return new File([buffer], ref.name, { type });
}
