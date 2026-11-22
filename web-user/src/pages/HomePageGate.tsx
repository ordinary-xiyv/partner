import { Spin } from 'antd';
import { lazy } from '../utils/lazyChunk';
import { useHomeStyle } from '../contexts/HomeStyleContext';

/**
 * 首页门禁：按伙伴选择的风格渲染。
 *
 * 两套风格都按需加载 —— 一次只可能渲染其中一套，
 * 另一套的 JS/CSS 不该进首屏包。这也是把它们做成两个入口文件
 * 而不是"同一份组件 + 一个 class 开关"的原因：
 * 后者做不到真正的按需，两套样式都会被打进主包。
 *
 * 骨架屏只在首次判断期间出现。判断本身依赖一次网络请求，
 * 但没有它就无法知道该渲染哪一套 —— 这是必要的等待，
 * 用一个居中的 spinner 比先渲染错风格再闪一下要好。
 */
const HomeEditorial = lazy(() => import('./home-style/HomeEditorial'));
const HomeTerminal = lazy(() => import('./home-style/HomeTerminal'));

export default function HomePageGate() {
  const { style, loading } = useHomeStyle();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return style === 'terminal' ? <HomeTerminal /> : <HomeEditorial />;
}
