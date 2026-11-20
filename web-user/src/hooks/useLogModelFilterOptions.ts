import { useEffect, useState } from 'react';
import { adminListCatalogModels, fetchAllCatalogModels } from '../api/catalog';

/**
 * 日志 / 日志汇总共用的模型名下拉数据源。
 * - 默认走公开广场接口（/api/lynx/catalog/models，仅 listed 且有可用渠道的模型），
 *   适用于普通用户（只能看到自己可用的模型，语义正确）。
 * - useAdminSource=true 时走 admin 目录接口（/api/lynx/admin/catalog/models），
 *   不限 listed、不做可用性收敛，返回全量目录行——适用于 platform_admin 身份
 *   在日志页筛全量模型。仍会漏掉从未录入目录的模型。
 *   注意：admin 目录接口要求 platform_admin 权限，Sales/Ops 等仅有 log_read_all
 *   的角色调用会被 403，因此调用方须按权限传参。
 */
export function useLogModelFilterOptions(useAdminSource = false) {
  const [modelFilterOptions, setModelFilterOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadModelOptions = async () => {
      setLoading(true);
      try {
        let names: string[];
        if (useAdminSource) {
          // 取 display_name：日志的 model_name 记录的是对外展示名，用户在模型广场
          // 看到的也是 display_name——按用户认知的名字搜索、筛选才对得上。
          const items = await adminListCatalogModels();
          names = (items || []).map((m) => (m.display_name || '').trim()).filter(Boolean);
        } else {
          const items = await fetchAllCatalogModels({ include_unavailable: false });
          names = items.map((m) => m.name.trim()).filter(Boolean);
        }
        if (cancelled) return;
        setModelFilterOptions(Array.from(new Set(names)).sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' }),
        ));
      } catch {
        if (!cancelled) setModelFilterOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadModelOptions();
    return () => { cancelled = true; };
  }, [useAdminSource]);

  return { modelFilterOptions, modelOptionsLoading: loading };
}
