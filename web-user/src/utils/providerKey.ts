/** provider_key: lowercase snake, ^[a-z][a-z0-9_]{0,63}$ */
export const PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export const MAX_PROVIDER_SVG_BYTES = 65536;

export function isValidProviderKey(key: string): boolean {
  return PROVIDER_KEY_PATTERN.test(key.trim());
}

export function validateProviderSvgFile(file: File): string | undefined {
  const lower = file.name.toLowerCase();
  const isSvgMime = file.type === 'image/svg+xml' || file.type === '';
  const isSvgExt = lower.endsWith('.svg');
  if (!isSvgExt && file.type && !file.type.startsWith('image/svg')) {
    return 'invalidType';
  }
  if (!isSvgExt && !isSvgMime) {
    return 'invalidType';
  }
  if (file.size > MAX_PROVIDER_SVG_BYTES) {
    return 'tooLarge';
  }
  return undefined;
}
