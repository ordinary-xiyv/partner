import { Typography } from 'antd';

const { Title } = Typography;

interface HomeSectionHeroTitleProps {
  accent: string;
  rest: string;
  /** 渐变字在前（如「统一接入」）；默认 true */
  accentFirst?: boolean;
  /** accent 与 rest 之间加空格与间距（仅平台能力区） */
  spaced?: boolean;
  className?: string;
}

export function HomeSectionHeroTitle({
  accent,
  rest,
  accentFirst = true,
  spaced = false,
  className,
}: HomeSectionHeroTitleProps) {
  const accentSpan = <span className="home-section-hero-title__accent">{accent}</span>;
  const restClassName = [
    'home-section-hero-title__rest',
    spaced ? 'home-section-hero-title__rest--spaced' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const restSpan = <span className={restClassName}>{rest}</span>;

  return (
    <Title
      level={2}
      className={['home-section-hero-title', className].filter(Boolean).join(' ')}
    >
      {accentFirst ? (
        <>
          {accentSpan}
          {spaced ? ' ' : null}
          {restSpan}
        </>
      ) : (
        <>
          {restSpan}
          {spaced ? ' ' : null}
          {accentSpan}
        </>
      )}
    </Title>
  );
}
