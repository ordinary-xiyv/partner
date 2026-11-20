import {
  HOME_MODEL_ACCESS_BLOCK_ICON,
  HOME_PLATFORM_CORE_BLOCK_ICON,
  HOME_SCHEDULING_BLOCK_ICON,
} from '../../constants/homeVisualAssets';

export type HomeBlockCubeIconBlock = 'core' | 'model-access' | 'scheduling';

const BLOCK_ICON_SRC: Record<HomeBlockCubeIconBlock, string> = {
  core: HOME_PLATFORM_CORE_BLOCK_ICON,
  'model-access': HOME_MODEL_ACCESS_BLOCK_ICON,
  scheduling: HOME_SCHEDULING_BLOCK_ICON,
};

interface HomeBlockCubeIconProps {
  block: HomeBlockCubeIconBlock;
}

/** 区块标题 icon */
export function HomeBlockCubeIcon({ block }: HomeBlockCubeIconProps) {
  return (
    <img
      className="home-block-cube-icon"
      src={BLOCK_ICON_SRC[block]}
      alt=""
      decoding="async"
      draggable={false}
    />
  );
}
