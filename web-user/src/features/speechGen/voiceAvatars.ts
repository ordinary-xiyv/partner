const avatarModules = import.meta.glob('../../assets/speech-gen/voices/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function filePathToVoiceId(filePath: string): string {
  const fileName = filePath.split('/').pop() ?? '';
  const slug = fileName.replace(/\.png$/i, '');
  return slug.replace(/-/g, ' ');
}

const VOICE_AVATAR_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(avatarModules).map(([path, url]) => [filePathToVoiceId(path), url]),
);

export function getVoiceAvatarUrl(voice: string | undefined): string | undefined {
  if (!voice) return undefined;
  return VOICE_AVATAR_URLS[voice.trim().toLowerCase()];
}
