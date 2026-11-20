/** 解析定价 `input_types`（如 text,image,video,audio）；未配置时 image/video 默认 true */
export type ModelInputTypeFlags = {
  image: boolean;
  video: boolean;
  /** 与语音合成配置一致时可标 audio；不表示聊天「上传音频附件」 */
  audio: boolean;
  isExplicit: boolean;
};

export function parseModelInputTypeFlags(inputTypes?: string): ModelInputTypeFlags {
  const trimmed = (inputTypes || '').trim();
  if (!trimmed) {
    return { image: true, video: true, audio: false, isExplicit: false };
  }
  const parts = trimmed.toLowerCase().split(/[,;\s]+/).filter(Boolean);
  return {
    image: parts.includes('image') || parts.includes('vision'),
    video: parts.includes('video'),
    audio: parts.includes('audio'),
    isExplicit: true,
  };
}

/** 聊天/视频 composer 附件种类（不含 TTS；语音合成走独立模块） */
export type AttachmentFileKind = 'image' | 'video';

export function fileToAttachmentKind(file: File): AttachmentFileKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

export function buildAcceptAttribute(flags: { image: boolean; video: boolean }): string {
  const parts: string[] = [];
  if (flags.image) parts.push('image/*');
  if (flags.video) parts.push('video/*');
  return parts.join(',');
}
