import type { ReactNode } from 'react';
import { HomeBlockTitle } from './HomeBlockTitle';
import { HomeBlockCubeIcon } from './HomeBlockCubeIcon';

interface HomeCapabilityPanelProps {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** 独立浅紫能力卡片容器：标题在容器顶部，内容在容器内 */
export function HomeCapabilityPanel({ title, children, className, bodyClassName }: HomeCapabilityPanelProps) {
  return (
    <div className={['home-capability-panel', className].filter(Boolean).join(' ')}>
      <HomeBlockTitle
        title={title}
        variant="accent"
        level={5}
        className="home-block-title--surface-gradient"
        icon={<HomeBlockCubeIcon block="scheduling" />}
      />
      <div className={['home-capability-panel__body', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
    </div>
  );
}
