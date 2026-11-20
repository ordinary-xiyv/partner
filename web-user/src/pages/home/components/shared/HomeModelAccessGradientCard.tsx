import { ArrowRightOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { Link } from 'react-router-dom';
import { HomeBlockTitle } from './HomeBlockTitle';
import { HomeBlockCubeIcon } from './HomeBlockCubeIcon';
import { HOME_MODEL_ACCESS_PANEL_IMAGE } from '../../constants/homeVisualAssets';
import { HomeCubeThumb } from './HomeCubeThumb';

const { Title, Paragraph } = Typography;

interface HomeModelAccessGradientCardProps {
  blockTitle: string;
  title: string;
  description: string;
  to: string;
  ctaLabel: string;
  /** 模型广场未上线时隐藏跳转 */
  hideCta?: boolean;
}

/** 模型接入：蓝渐变外卡 + 透明内容区 */
export function HomeModelAccessGradientCard({
  blockTitle,
  title,
  description,
  to,
  ctaLabel,
  hideCta = false,
}: HomeModelAccessGradientCardProps) {
  return (
    <div className="home-model-access-card">
      <HomeBlockTitle
        title={blockTitle}
        variant="accent"
        level={5}
        className="home-block-title--surface-gradient"
        icon={<HomeBlockCubeIcon block="model-access" />}
      />
      <div className="home-model-access-card__panel">
        <Title level={5} className="home-model-access-card__title">
          {title}
        </Title>
        <Paragraph className="home-model-access-card__desc">{description}</Paragraph>
        <div className="home-model-access-card__media" aria-hidden>
          <HomeCubeThumb
            className="home-model-access-card__cube"
            src={HOME_MODEL_ACCESS_PANEL_IMAGE}
            fillParent
          />
        </div>
        {!hideCta ? (
          <Link to={to} className="home-model-access-card__arrow" aria-label={ctaLabel}>
            <ArrowRightOutlined />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
