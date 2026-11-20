import { useEffect, useState } from 'react';
import type { PlazaBannerPublic } from '../../types/catalog';
import './plaza-hero-banner.css';

export interface PlazaHeroBannerProps {
  banners: PlazaBannerPublic[];
  variant: 'cell' | 'hero';
  active?: boolean;
  onOpen?: (catalogModelId: number) => void;
}

export function PlazaHeroBanner({ banners, variant, active = true, onOpen }: PlazaHeroBannerProps) {
  const [index, setIndex] = useState(0);
  const current = banners[index] ?? banners[0];

  useEffect(() => {
    setIndex(0);
  }, [banners]);

  useEffect(() => {
    if (!active || variant !== 'cell' || banners.length <= 1) return undefined;
    const timer = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [active, variant, banners.length, index]);

  if (!current) return null;

  const open = () => {
    if (!current.catalog_model_id) return;
    onOpen?.(current.catalog_model_id);
  };

  if (variant === 'hero') {
    return (
      <div className="plaza-hero-row">
        {banners.map((banner) => (
          <button
            key={banner.id}
            type="button"
            className="plaza-hero-banner plaza-hero-banner--hero"
            style={banner.image_url ? { backgroundImage: `url(${banner.image_url})` } : undefined}
            onClick={() => {
              if (!banner.catalog_model_id) return;
              onOpen?.(banner.catalog_model_id);
            }}
          >
            <span className="plaza-hero-banner__copy">
              <strong>{banner.display_name}</strong>
              {banner.description ? <span>{banner.description}</span> : null}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="plaza-hero-banner plaza-hero-banner--cell">
      <button
        type="button"
        className="plaza-hero-banner__hit"
        style={current.image_url ? { backgroundImage: `url(${current.image_url})` } : undefined}
        onClick={open}
      >
        <span className="plaza-hero-banner__copy">
          <strong>{current.display_name}</strong>
          {current.description ? <span>{current.description}</span> : null}
        </span>
      </button>
      {banners.length > 1 ? (
        <div className="plaza-hero-banner__dots" role="tablist">
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              className={`plaza-hero-banner__dot${i === index ? ' is-active' : ''}`}
              aria-label={banner.display_name}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
