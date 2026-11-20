import { HomeFeaturedModelsSection } from './HomeFeaturedModelsSection';
import { HomeIntegrationSection } from './HomeIntegrationSection';

interface HomeIntegrationFeaturedSectionProps {
  featuredModelsCount: number | null;
}

export function HomeIntegrationFeaturedSection({ featuredModelsCount }: HomeIntegrationFeaturedSectionProps) {
  return (
    <section className="home-section-plate home-section-muted">
      <div
        className="landing-section grid-2col"
        style={{ maxWidth: 1160, margin: '0 auto', padding: '26px 40px', display: 'grid', gridTemplateColumns: '1.02fr 0.98fr', gap: 24 }}
      >
        <HomeIntegrationSection />
        <HomeFeaturedModelsSection featuredModelsCount={featuredModelsCount} />
      </div>
    </section>
  );
}
