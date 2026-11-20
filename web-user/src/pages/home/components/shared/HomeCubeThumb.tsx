import { HOME_CUBE_CLUSTER_IMAGE } from '../../constants/homeVisualAssets';
import './home-shared.css';

interface HomeCubeThumbProps {
  className?: string;
  size?: number;
  src?: string;
  /** 铺满父容器（用于新闻卡右侧插图区） */
  fillParent?: boolean;
}

export function HomeCubeThumb({
  className,
  size = 96,
  src = HOME_CUBE_CLUSTER_IMAGE,
  fillParent = false,
}: HomeCubeThumbProps) {
  return (
    <div
      className={['home-cube-thumb', fillParent && 'home-cube-thumb--fill', className]
        .filter(Boolean)
        .join(' ')}
      style={fillParent ? undefined : { width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      <img className="home-cube-thumb__img" src={src} alt="" decoding="async" draggable={false} />
    </div>
  );
}
