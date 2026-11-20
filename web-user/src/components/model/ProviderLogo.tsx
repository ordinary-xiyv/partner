export interface ProviderLogoProps {
  iconDataUri?: string;
  size?: number;
  className?: string;
}

/** 仅在有后台 provider 图标时渲染；无图不占位、不展示默认图 */
export function ProviderLogo({ iconDataUri, size = 40, className }: ProviderLogoProps) {
  if (!iconDataUri) return null;

  return (
    <span
      className={`provider-logo${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img src={iconDataUri} alt="" className="provider-logo-img" />
    </span>
  );
}
