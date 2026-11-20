/** 在片尾前提前跳回起点，避免原生 loop 在首尾切换时的卡顿 */
const LOOP_LEAD_SEC = 0.12;

/**
 * 绑定无缝循环：请移除 video 的 loop 属性后调用。
 * ended 作为兜底，防止 timeupdate 未触发时停在最后一帧。
 */
export function attachSeamlessVideoLoop(video: HTMLVideoElement): () => void {
  let isSeeking = false;

  const restart = () => {
    if (isSeeking) return;
    isSeeking = true;
    try {
      if (video.currentTime > 0.001) {
        video.currentTime = 0;
      }
      if (video.paused) {
        void video.play().catch(() => undefined);
      }
    } finally {
      requestAnimationFrame(() => {
        isSeeking = false;
      });
    }
  };

  const onTimeUpdate = () => {
    const { duration, currentTime } = video;
    if (!Number.isFinite(duration) || duration <= LOOP_LEAD_SEC) return;
    if (duration - currentTime <= LOOP_LEAD_SEC) {
      restart();
    }
  };

  const onEnded = () => {
    restart();
  };

  video.addEventListener('timeupdate', onTimeUpdate);
  video.addEventListener('ended', onEnded);
  return () => {
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('ended', onEnded);
  };
}
