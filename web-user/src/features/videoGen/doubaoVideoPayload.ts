/**
 * Seedance / 豆包视频任务 POST /v1/videos 请求体（瘦 JSON：媒体 URL 仅在 metadata.content 出现一次）。
 */

import { isPublicHttpUrl } from './happyHorse';

export type VideoSubmitAttachment = {
  kind: 'image' | 'video';
  preview: string;
  ossPublicUrl?: string;
};

export function resolveVideoSubmitMediaUrl(att: VideoSubmitAttachment): string {
  if (att.kind === 'video') {
    return (att.ossPublicUrl || '').trim();
  }
  return att.preview.trim();
}

export type BuildDoubaoVideoPayloadInput = {
  model: string;
  prompt: string;
  durationSec: number;
  resolution: string;
  ratio: string;
  genMode: 'first_last' | 'omni_reference';
  imageAttachments: VideoSubmitAttachment[];
  videoAttachments: VideoSubmitAttachment[];
  seedance20: boolean;
};

/** 非欢乐马模型的 /v1/videos 请求体（豆包 Seedance 等） */
export function buildDoubaoVideoPayload(input: BuildDoubaoVideoPayloadInput): Record<string, unknown> {
  const {
    model,
    prompt,
    durationSec,
    resolution,
    ratio,
    genMode,
    imageAttachments,
    videoAttachments,
    seedance20,
  } = input;

  const contentItems: Record<string, unknown>[] = [{ type: 'text', text: prompt }];

  if (genMode === 'first_last' && imageAttachments.length >= 2) {
    const first = resolveVideoSubmitMediaUrl(imageAttachments[0]!);
    const last = resolveVideoSubmitMediaUrl(imageAttachments[1]!);
    if (first) {
      contentItems.push({
        type: 'image_url',
        image_url: { url: first },
        role: 'first_frame',
      });
    }
    if (last) {
      contentItems.push({
        type: 'image_url',
        image_url: { url: last },
        role: 'last_frame',
      });
    }
  } else {
    for (const img of imageAttachments) {
      const url = resolveVideoSubmitMediaUrl(img);
      if (!url) continue;
      contentItems.push({
        type: 'image_url',
        image_url: { url },
        role: 'reference_image',
      });
    }
    for (const vid of videoAttachments) {
      const url = resolveVideoSubmitMediaUrl(vid);
      if (!url || !isPublicHttpUrl(url)) continue;
      contentItems.push({
        type: 'video_url',
        video_url: { url },
        role: 'reference_video',
      });
    }
  }

  const metadata: Record<string, unknown> = {
    duration: durationSec,
    resolution,
    ratio,
    aspect_ratio: ratio,
    video_gen_mode: genMode,
    content: contentItems,
  };

  if (seedance20 && genMode === 'first_last' && imageAttachments.length >= 2) {
    metadata.task_type = 'i2v';
  }

  return {
    model,
    prompt,
    mode: genMode,
    resolution,
    ratio,
    duration: durationSec,
    metadata,
  };
}
