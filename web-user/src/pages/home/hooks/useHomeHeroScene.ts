import { useEffect, useMemo, useState } from 'react';
import { flattenHomeHeroPartners } from '../constants/homeHeroPartners';

const PARTNER_CYCLE_MS = 4200;

/** Hero 场景：合作商轮播索引 + 无障碍动效偏好 */
export function useHomeHeroScene() {
  const partners = useMemo(() => flattenHomeHeroPartners(), []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setIsReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (isReducedMotion || partners.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % partners.length);
    }, PARTNER_CYCLE_MS);

    return () => window.clearInterval(timer);
  }, [isReducedMotion, partners.length]);

  const activePartner = partners[activeIndex] ?? partners[0];

  return {
    partners,
    activeIndex,
    activePartner,
    isReducedMotion,
    setActiveIndex,
  };
}
