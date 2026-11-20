/** MiniMax H3 / H3 Max 视频能力与 /v1/videos 请求体（与 hailuo validateH3Request 对齐） */

export const MINIMAX_H3_MODEL = 'minimax-video-h3';
export const MINIMAX_H3_MAX_MODEL = 'minimax-video-h3-max';

export type MiniMaxH3Variant = 'h3' | 'h3-max';

export type MiniMaxH3GenMode = 't2v' | 'first_frame' | 'first_last' | 'omni_ref';

export const MINIMAX_H3_RESOLUTIONS = ['768P', '2K'] as const;
export const MINIMAX_H3_MAX_RESOLUTIONS = ['480P', '768P'] as const;

/** 文生视频不可 adaptive；有画面输入时后端默认 adaptive */
export const MINIMAX_H3_T2V_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;
export const MINIMAX_H3_VISUAL_RATIOS = ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;

export const MINIMAX_H3_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';
export const MINIMAX_H3_OMNI_ACCEPT = `${MINIMAX_H3_IMAGE_ACCEPT},video/*,audio/*`;
export const MINIMAX_H3_MAX_IMAGE_BYTES = 30 * 1024 * 1024;

const H3_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
]);

const H3_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];

export type MiniMaxH3UiConfig = {
  variant: MiniMaxH3Variant;
  modes: MiniMaxH3GenMode[];
  resolutions: readonly string[];
  durationMin: number;
  durationMax: number;
  maxImageBytes: number;
  omni: { maxImages: number; maxVideos: number; maxAudios: number; maxTotal: number } | null;
};

export function getMiniMaxH3Variant(model: string): MiniMaxH3Variant | null {
  const m = model.trim().toLowerCase();
  if (!m) return null;
  const short = m.includes('/') ? (m.split('/').pop() || m) : m;
  if (short === MINIMAX_H3_MAX_MODEL || short === 'minimax-h3-max') return 'h3-max';
  if (short === MINIMAX_H3_MODEL || short === 'minimax-h3') return 'h3';
  return null;
}

export function isMiniMaxH3Model(model: string): boolean {
  return getMiniMaxH3Variant(model) != null;
}

export function getMiniMaxH3UiConfig(variant: MiniMaxH3Variant): MiniMaxH3UiConfig {
  if (variant === 'h3-max') {
    return {
      variant,
      modes: ['t2v', 'first_frame', 'first_last'],
      resolutions: MINIMAX_H3_MAX_RESOLUTIONS,
      durationMin: 5,
      durationMax: 15,
      maxImageBytes: MINIMAX_H3_MAX_IMAGE_BYTES,
      omni: null,
    };
  }
  return {
    variant,
    modes: ['t2v', 'first_frame', 'first_last', 'omni_ref'],
    resolutions: MINIMAX_H3_RESOLUTIONS,
    durationMin: 4,
    durationMax: 15,
    maxImageBytes: MINIMAX_H3_MAX_IMAGE_BYTES,
    omni: { maxImages: 9, maxVideos: 3, maxAudios: 3, maxTotal: 12 },
  };
}

export function getMiniMaxH3RatioOptions(mode: MiniMaxH3GenMode): readonly string[] {
  return mode === 't2v' ? MINIMAX_H3_T2V_RATIOS : MINIMAX_H3_VISUAL_RATIOS;
}

export function clampMiniMaxH3Duration(sec: number, variant: MiniMaxH3Variant): number {
  const { durationMin, durationMax } = getMiniMaxH3UiConfig(variant);
  if (!Number.isFinite(sec)) return durationMin;
  return Math.min(durationMax, Math.max(durationMin, Math.round(sec)));
}

export function isMiniMaxH3AllowedImageFile(file: File): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  if (H3_IMAGE_MIMES.has(mime)) return true;
  const name = file.name.trim().toLowerCase();
  return H3_IMAGE_EXTS.some((ext) => name.endsWith(ext));
}

export function isMiniMaxH3AudioFile(file: File): boolean {
  if ((file.type || '').toLowerCase().startsWith('audio/')) return true;
  return /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(file.name);
}

export type MiniMaxH3MediaUrl = { url: string; kind: 'image' | 'video' | 'audio' };

export type MiniMaxH3PayloadInput = {
  model: string;
  prompt: string;
  durationSec: number;
  resolution: string;
  aspectRatio: string;
  mode: MiniMaxH3GenMode;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  references: MiniMaxH3MediaUrl[];
};

type H3ContentItem = {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url';
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  role?: string;
};

function normalizeH3Resolution(variant: MiniMaxH3Variant, resolution: string): string {
  const r = resolution.trim().toUpperCase();
  const allowed = getMiniMaxH3UiConfig(variant).resolutions;
  if (allowed.includes(r)) return r;
  return allowed[0] ?? '768P';
}

function normalizeH3Ratio(mode: MiniMaxH3GenMode, ratio: string): string {
  const options = getMiniMaxH3RatioOptions(mode);
  const raw = ratio.trim();
  if (options.includes(raw)) return raw;
  return mode === 't2v' ? '16:9' : 'adaptive';
}

/** 构建 POST /v1/videos：显式 metadata.content，避免后端按张数猜 first/last vs reference */
export function buildMiniMaxH3VideoPayload(input: MiniMaxH3PayloadInput): Record<string, unknown> {
  const variant = getMiniMaxH3Variant(input.model);
  if (!variant) {
    throw new Error(`not a minimax h3 model: ${input.model}`);
  }
  const durationSec = clampMiniMaxH3Duration(input.durationSec, variant);
  const resolution = normalizeH3Resolution(variant, input.resolution);
  const ratio = normalizeH3Ratio(input.mode, input.aspectRatio);
  const prompt = input.prompt.trim();
  const content: H3ContentItem[] = [{ type: 'text', text: prompt }];

  if (input.mode === 'first_frame' || input.mode === 'first_last') {
    const first = (input.firstFrameUrl || '').trim();
    if (first) {
      content.push({ type: 'image_url', image_url: { url: first }, role: 'first_frame' });
    }
    if (input.mode === 'first_last') {
      const last = (input.lastFrameUrl || '').trim();
      if (last) {
        content.push({ type: 'image_url', image_url: { url: last }, role: 'last_frame' });
      }
    }
  } else if (input.mode === 'omni_ref') {
    for (const ref of input.references) {
      const url = ref.url.trim();
      if (!url) continue;
      if (ref.kind === 'image') {
        content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
      } else if (ref.kind === 'video') {
        content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
      } else {
        content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
      }
    }
  }

  const metadata: Record<string, unknown> = {
    duration: durationSec,
    resolution,
    ratio,
    aspect_ratio: ratio,
    video_gen_mode: input.mode,
    content,
  };

  return {
    model: input.model,
    prompt,
    duration: durationSec,
    resolution,
    ratio,
    metadata,
  };
}
