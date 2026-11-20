import type { CatalogDetailDTO } from '../../../types/catalog';
import { pickPageScenarios, pickPageSpec } from './specDisplayHelpers';

function isEmptyDoc(data: Record<string, unknown> | undefined): boolean {
  if (!data) return true;
  return Object.keys(data).length === 0;
}

export function hasSpecsTabContent(detail: CatalogDetailDTO): boolean {
  if (!detail.groups?.length) return false;
  return pickPageScenarios(detail.groups).length > 0 || pickPageSpec(detail.groups) !== null;
}

export function hasHttpApiTabContent(detail: CatalogDetailDTO): boolean {
  return Boolean(detail.docs?.http_api?.curl?.trim());
}

export function hasIntegrationTabContent(data: Record<string, unknown> | undefined): boolean {
  return !isEmptyDoc(data);
}
