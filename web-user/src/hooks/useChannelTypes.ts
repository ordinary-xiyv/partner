import { useCallback, useEffect, useState } from 'react';
import { getAdminChannelTypes } from '../api';
import type { ChannelTypeOption } from '../types';

type ChannelTypeSelectOption = {
  value: number;
  label: string;
};

let cachedOptions: ChannelTypeSelectOption[] | null = null;
let cachedLabelByValue: Record<number, string> | null = null;
let inflight: Promise<void> | null = null;

function buildCaches(items: ChannelTypeOption[]) {
  const filtered = items.filter((item) => item.value !== 0);
  const labelByValue: Record<number, string> = {};
  const options: ChannelTypeSelectOption[] = filtered.map((item) => {
    labelByValue[item.value] = item.label;
    return { value: item.value, label: item.label };
  });
  cachedOptions = options;
  cachedLabelByValue = labelByValue;
}

async function ensureChannelTypesLoaded(): Promise<void> {
  if (cachedOptions && cachedLabelByValue) return;
  if (inflight) {
    await inflight;
    return;
  }
  inflight = (async () => {
    try {
      const res = await getAdminChannelTypes();
      if (res.data.success) {
        buildCaches(res.data.data || []);
      } else {
        buildCaches([]);
      }
    } catch {
      buildCaches([]);
    }
  })().finally(() => {
    inflight = null;
  });
  await inflight;
}

/** 渠道类型字典（GET /api/lynx/admin/channel/types），全站共享缓存 */
export function useChannelTypes() {
  const [options, setOptions] = useState<ChannelTypeSelectOption[]>(cachedOptions || []);
  const [labelByValue, setLabelByValue] = useState<Record<number, string>>(cachedLabelByValue || {});
  const [loading, setLoading] = useState(!cachedOptions);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cachedOptions && cachedLabelByValue) {
        setOptions(cachedOptions);
        setLabelByValue(cachedLabelByValue);
        setLoading(false);
        return;
      }
      setLoading(true);
      await ensureChannelTypesLoaded();
      if (cancelled) return;
      setOptions(cachedOptions || []);
      setLabelByValue(cachedLabelByValue || {});
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getLabel = useCallback(
    (type: number) => labelByValue[type] ?? `Type ${type}`,
    [labelByValue],
  );

  return { options, labelByValue, getLabel, loading };
}
