/** 与 ChatShell / 视频 / 语音页定价过滤一致：按 modalities 字符串归类 */
export function modalityCategory(modalities: string | undefined): 'image' | 'video' | 'audio' | 'text' {
  const s = (modalities || '').toLowerCase();
  if (/\bimage\b/i.test(s)) return 'image';
  if (/\bvideo\b/i.test(s)) return 'video';
  if (/\baudio\b/i.test(s)) return 'audio';
  return 'text';
}
