import type { CatalogListFilters } from '../../types/catalog';

export function countActiveFilters(filters: CatalogListFilters): number {
  let n = 0;
  if (filters.category) n += 1;
  if (filters.provider) n += 1;
  if (filters.group) n += 1;
  if (filters.tags.length > 0) n += 1;
  if (filters.pricingType) n += 1;
  return n;
}
