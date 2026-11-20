import type { AdminGroup } from '../../types';

export interface GroupSelectOption {
  value: string;
  label: string;
}

/** 解析 group 字段（逗号分隔，如 default,vip）— 渠道 / 令牌等共用 */
export function parseChannelGroups(group?: string): string[] {
  if (!group?.trim()) return ['default'];
  const list = group.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : ['default'];
}

/** 提交 group 字段（逗号拼接） */
export function formatChannelGroups(groups: string[]): string {
  const list = groups.map((g) => g.trim()).filter(Boolean);
  return list.length > 0 ? list.join(',') : 'default';
}

/**
 * 分组多选下拉选项：已启用分组 + 保留当前已选（含已禁用）
 * @param opts.trustServerFilter 为 true 时信任服务端已过滤的列表（如 /api/lynx/groups），不再按 enabled 二次筛选
 */
export function buildGroupSelectOptions(
  groups: AdminGroup[],
  currentGroups?: string[],
  opts?: { trustServerFilter?: boolean },
): GroupSelectOption[] {
  const enabled = opts?.trustServerFilter ? groups : groups.filter((g) => g.enabled);
  const optionMap = new Map<string, GroupSelectOption>();
  for (const g of enabled) {
    optionMap.set(g.name, { value: g.name, label: g.name });
  }
  for (const name of currentGroups ?? []) {
    const n = name.trim();
    if (n && !optionMap.has(n)) {
      optionMap.set(n, { value: n, label: n });
    }
  }
  return Array.from(optionMap.values());
}
