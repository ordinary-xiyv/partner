import { HOME_CUBE_CLUSTER_IMAGE } from '../constants/homeVisualAssets';
import './home-hero-cube-visual.css';

/** Hero 右侧 3D 玻璃立方体（透明 PNG） */
export function HomeHeroCubeVisual() {
  return (
    <div className="home-hero-cube-visual home-hero-cube-visual--alpha" aria-hidden>
      <div className="home-hero-cube-visual__blend">
        <div className="home-hero-cube-visual__glow" />
        <img
          className="home-hero-cube-visual__img"
          src={HOME_CUBE_CLUSTER_IMAGE}
          alt=""
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}
