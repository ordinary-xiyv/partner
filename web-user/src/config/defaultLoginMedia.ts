import type { LoginMediaConfig, LoginMediaType } from '../types/siteAppearance';

export function buildDefaultLoginMediaConfig(): LoginMediaConfig {
  return {
    type: 'none',
    image_file_id: '',
    video_file_id: '',
    poster_file_id: '',
  };
}

/** 归一登录页媒体配置：type 非法或对应 file_id 缺失时回落 none */
export function normalizeLoginMediaConfig(
  raw: Partial<LoginMediaConfig> | undefined,
): LoginMediaConfig {
  const base = buildDefaultLoginMediaConfig();
  if (!raw) return base;

  const imageId = raw.image_file_id?.trim() || '';
  const videoId = raw.video_file_id?.trim() || '';
  const posterId = raw.poster_file_id?.trim() || '';

  let type: LoginMediaType = 'none';
  if (raw.type === 'video' && videoId) {
    type = 'video';
  } else if (raw.type === 'image' && imageId) {
    type = 'image';
  }

  return {
    type,
    image_file_id: imageId,
    image_url: raw.image_url,
    video_file_id: videoId,
    video_url: raw.video_url,
    poster_file_id: posterId,
    poster_url: raw.poster_url,
  };
}
