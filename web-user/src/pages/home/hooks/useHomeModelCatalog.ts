import { useEffect, useMemo, useState } from 'react';
import { getPricing } from '../../../api';
import type { ModelCatalogStat } from '../types';

export function useHomeModelCatalog() {
  const [modelCatalogStat, setModelCatalogStat] = useState<ModelCatalogStat>({ phase: 'loading' });

  useEffect(() => {
    getPricing()
      .then((res) => {
        const data = res.data.data || res.data;
        if (Array.isArray(data)) setModelCatalogStat({ phase: 'ready', count: data.length });
        else setModelCatalogStat({ phase: 'ready', count: 0 });
      })
      .catch(() => setModelCatalogStat({ phase: 'error' }));
  }, []);

  const featuredModelsCount = useMemo(() => {
    if (modelCatalogStat.phase === 'loading') return null as number | null;
    if (modelCatalogStat.phase === 'error') return 100;
    return modelCatalogStat.count > 0 ? modelCatalogStat.count : 100;
  }, [modelCatalogStat]);

  return { modelCatalogStat, featuredModelsCount };
}
