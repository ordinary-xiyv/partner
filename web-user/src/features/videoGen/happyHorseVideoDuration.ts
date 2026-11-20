/** 欢乐马 video-edit 源视频时长（与百炼上游校验对齐：3~60 秒） */

export const HAPPYHORSE_VIDEO_EDIT_MIN_SOURCE_SEC = 3;
export const HAPPYHORSE_VIDEO_EDIT_MAX_SOURCE_SEC = 60;

export function isHappyHorseVideoEditSourceDurationValid(durationSec: number): boolean {
  return (
    Number.isFinite(durationSec)
    && durationSec >= HAPPYHORSE_VIDEO_EDIT_MIN_SOURCE_SEC
    && durationSec <= HAPPYHORSE_VIDEO_EDIT_MAX_SOURCE_SEC
  );
}

/** 用浏览器读取本地视频时长（秒） */
export function readLocalVideoDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };
    video.onloadedmetadata = () => {
      const durationSec = video.duration;
      cleanup();
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        reject(new Error('invalid_duration'));
        return;
      }
      resolve(durationSec);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('metadata_load_failed'));
    };
    video.src = url;
  });
}
