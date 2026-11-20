import { Spin } from 'antd';
import { lazy } from '../utils/lazyChunk';
import { HOME_PAGE_MODE_ALT } from '../config/homePageMode';
import { useHomePageMode } from '../contexts/HomePageModeContext';

const HomePageDefault = lazy(() => import('./home/HomePage'));
const HomePageAlt = lazy(() => import('./home-alt/HomePageAlt'));

export default function HomePageGate() {
  const { mode, loading } = useHomePageMode();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return mode === HOME_PAGE_MODE_ALT ? <HomePageAlt /> : <HomePageDefault />;
}
