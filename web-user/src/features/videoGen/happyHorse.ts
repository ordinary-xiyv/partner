/** 欢乐马（HappyHorse）模型识别与参数约束，与阿里云百炼官方 API 对齐 */

export type HappyHorseMode = 't2v' | 'i2v' | 'r2v' | 'video-edit';

export type HappyHorseUploadKind = 'none' | 'first-frame' | 'reference-images' | 'video-edit';

export type HappyHorseUiConfig = {
  mode: HappyHorseMode;
  /** 欢乐马无「全能参考 / 首尾帧」，仅 Seedance 等模型使用 */
  showLegacyGenModeSwitcher: false;
  uploadKind: HappyHorseUploadKind;
  maxImages: number;
  showRatio: boolean;
  showDuration: boolean;
  showSeed: boolean;
  showAudioSetting: boolean;
  promptRequired: boolean;
};

export function getHappyHorseMode(model: string): HappyHorseMode | null {
  const m = model.trim().toLowerCase();
  if (!m.includes('happyhorse')) return null;
  if (m.includes('video-edit')) return 'video-edit';
  if (m.includes('r2v')) return 'r2v';
  if (m.includes('i2v')) return 'i2v';
  if (m.includes('t2v')) return 't2v';
  return null;
}

export function isHappyHorseModel(model: string): boolean {
  return getHappyHorseMode(model) !== null;
}

/** 文生视频 ratio（官方） */
export const HAPPYHORSE_T2V_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '4:5', '5:4'] as const;
/** 参考生视频 ratio（百炼官方 r2v 文档） */
export const HAPPYHORSE_R2V_RATIOS = ['16:9', '9:16', '3:4', '4:3', '4:5', '5:4', '1:1', '9:21', '21:9'] as const;

export const HAPPYHORSE_RESOLUTIONS = ['720p', '1080p'] as const;

export function getHappyHorseUiConfig(mode: HappyHorseMode): HappyHorseUiConfig {
  switch (mode) {
    case 't2v':
      return {
        mode,
        showLegacyGenModeSwitcher: false,
        uploadKind: 'none',
        maxImages: 0,
        showRatio: true,
        showDuration: true,
        showSeed: true,
        showAudioSetting: false,
        promptRequired: true,
      };
    case 'i2v':
      return {
        mode,
        showLegacyGenModeSwitcher: false,
        uploadKind: 'first-frame',
        maxImages: 1,
        showRatio: false,
        showDuration: true,
        showSeed: true,
        showAudioSetting: false,
        promptRequired: false,
      };
    case 'r2v':
      return {
        mode,
        showLegacyGenModeSwitcher: false,
        uploadKind: 'reference-images',
        maxImages: 9,
        showRatio: true,
        showDuration: true,
        showSeed: false,
        showAudioSetting: false,
        promptRequired: true,
      };
    case 'video-edit':
      return {
        mode,
        showLegacyGenModeSwitcher: false,
        uploadKind: 'video-edit',
        maxImages: 5,
        showRatio: false,
        showDuration: false,
        showSeed: false,
        showAudioSetting: true,
        promptRequired: true,
      };
    default:
      return {
        mode: 't2v',
        showLegacyGenModeSwitcher: false,
        uploadKind: 'none',
        maxImages: 0,
        showRatio: true,
        showDuration: true,
        showSeed: true,
        showAudioSetting: false,
        promptRequired: true,
      };
  }
}

export function getHappyHorseRatioOptions(mode: HappyHorseMode | null): readonly string[] {
  if (mode === 'r2v') return HAPPYHORSE_R2V_RATIOS;
  if (mode === 't2v') return HAPPYHORSE_T2V_RATIOS;
  return HAPPYHORSE_T2V_RATIOS;
}

export function clampHappyHorseDuration(sec: number): number {
  if (!Number.isFinite(sec)) return 5;
  return Math.min(15, Math.max(3, Math.round(sec)));
}

export function isPublicHttpUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.startsWith('http://') || u.startsWith('https://');
}

export type HappyHorseAttachmentInput = {
  firstFramePreview?: string;
  imagePreviews: string[];
  videoSourceUrl?: string;
};

/** 按官方四种模式收集待提交的媒体 URL */
export function collectHappyHorseMediaUrls(
  mode: HappyHorseMode,
  input: HappyHorseAttachmentInput,
): { imageUrls: string[]; videoUrls: string[] } {
  const images = input.imagePreviews.map((u) => u.trim()).filter(Boolean);
  const videoUrl = (input.videoSourceUrl || '').trim();

  switch (mode) {
    case 'i2v': {
      const first = (input.firstFramePreview || images[0] || '').trim();
      return { imageUrls: first ? [first] : [], videoUrls: [] };
    }
    case 'r2v':
      return { imageUrls: images.slice(0, 9), videoUrls: [] };
    case 'video-edit': {
      // const refs = images.slice(0, 5);
      const refs = images.slice(0, 9);
      return {
        imageUrls: refs,
        videoUrls: isPublicHttpUrl(videoUrl) ? [videoUrl] : [],
      };
    }
    default:
      return { imageUrls: [], videoUrls: [] };
  }
}

export type HappyHorseVideoPayloadInput = {
  model: string;
  prompt: string;
  durationSec: number;
  resolution: string;
  aspectRatio: string;
  imageUrls: string[];
  videoUrls?: string[];
  seed?: number;
  audioSetting?: 'auto' | 'origin';
};

/** 构建 POST /v1/videos 请求体，字段与后端 TaskSubmitReq + 官方 HappyHorse 对齐 */
/** 官方 API 使用 720P / 1080P */
export function normalizeHappyHorseResolution(resolution: string): string {
  const r = resolution.trim().toUpperCase();
  if (r === '720P' || r === '1080P') return r;
  if (r === '720' || r.includes('720')) return '720P';
  if (r === '1080' || r.includes('1080')) return '1080P';
  return '720P';
}

export function buildHappyHorseVideoPayload(input: HappyHorseVideoPayloadInput): Record<string, unknown> {
  const hhMode = getHappyHorseMode(input.model);
  const imageUrls = input.imageUrls.filter(Boolean);
  const videoUrls = (input.videoUrls || []).filter(Boolean);
  const resolution = normalizeHappyHorseResolution(input.resolution);
  /** r2v 参考图为 data URL 时体积大，避免在 content/images/metadata 多处重复塞同一批 base64 */
  const slimRefPayload = hhMode === 'r2v' && imageUrls.length > 0;

  const content: Record<string, unknown>[] = [{ type: 'text', text: input.prompt }];
  if (!slimRefPayload) {
    for (let i = 0; i < imageUrls.length; i += 1) {
      const url = imageUrls[i];
      content.push({
        type: 'image_url',
        image_url: { url },
        ...(hhMode === 'i2v' && i === 0 ? { role: 'first_frame' } : {}),
      });
    }
  }

  const metadata: Record<string, unknown> = {
    duration: input.durationSec,
    resolution,
    happyhorse_mode: hhMode,
    content: slimRefPayload ? [{ type: 'text', text: input.prompt }] : content,
  };
  if (hhMode === 't2v' || hhMode === 'r2v') {
    metadata.ratio = input.aspectRatio;
    metadata.aspect_ratio = input.aspectRatio;
  }
  if (imageUrls.length > 0 && !slimRefPayload) {
    metadata.reference_images = imageUrls;
    if (hhMode === 'i2v') {
      metadata.img_url = imageUrls[0];
      metadata.first_frame_url = imageUrls[0];
    }
  }
  if (input.seed != null && Number.isFinite(input.seed)) {
    metadata.seed = input.seed;
  }
  if (hhMode === 'video-edit' && input.audioSetting) {
    metadata.audio_setting = input.audioSetting;
  }
  const inputMedia = buildHappyHorseInputMedia(hhMode, imageUrls, videoUrls);
  if (inputMedia && inputMedia.length > 0) {
    metadata.input = { prompt: input.prompt, media: inputMedia };
  }
  if (videoUrls[0]) {
    metadata.reference_video_url = videoUrls[0];
    metadata.reference_video_urls = videoUrls;
  }

  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    content,
    resolution,
    duration: input.durationSec,
    metadata,
  };
  if (!slimRefPayload) {
    body.images = imageUrls;
  }
  if (imageUrls[0] && hhMode === 'i2v') {
    body.image = imageUrls[0];
    body.input_reference = imageUrls[0];
  }
  if (hhMode === 't2v' || hhMode === 'r2v') {
    body.ratio = input.aspectRatio;
  }
  if (videoUrls[0]) {
    body.reference_video_url = videoUrls[0];
    body.reference_video_urls = videoUrls;
  }
  return body;
}

function buildHappyHorseInputMedia(
  mode: HappyHorseMode | null,
  imageUrls: string[],
  videoUrls: string[],
): Array<{ type: string; url: string }> | undefined {
  if (!mode) return undefined;
  switch (mode) {
    case 'i2v':
      return imageUrls[0] ? [{ type: 'first_frame', url: imageUrls[0] }] : undefined;
    case 'r2v':
      return imageUrls.length > 0
        ? imageUrls.slice(0, 9).map((url) => ({ type: 'reference_image', url }))
        : undefined;
    case 'video-edit': {
      const video = videoUrls[0];
      if (!video) return undefined;
      const media: Array<{ type: string; url: string }> = [{ type: 'video', url: video }];
      // for (const url of imageUrls.slice(0, 5)) {
      for (const url of imageUrls.slice(0, 9)) {
        media.push({ type: 'reference_image', url });
      }
      return media;
    }
    default:
      return undefined;
  }
}
