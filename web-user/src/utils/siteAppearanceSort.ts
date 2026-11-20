export function normalizeSortPath(path: string): string {
  if (!path) return '/';
  const trimmed = path.trim();
  if (trimmed === '/') return '/';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/** 按 sort 排序后重新写入 10、20、30… */
export function reassignSortValues<T extends { sort: number }>(items: T[]): T[] {
  return items.map((item, index) => ({
    ...item,
    sort: (index + 1) * 10,
  }));
}

export function sortBySortField<T extends { sort: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort - b.sort);
}

export function moveSortableItem<T extends { id: string; sort: number }>(
  items: T[],
  id: string,
  direction: 'up' | 'down',
): T[] {
  const sorted = sortBySortField(items);
  const index = sorted.findIndex((item) => item.id === id);
  if (index < 0) return items;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return items;

  const next = [...sorted];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return reassignSortValues(next);
}

export function formatPositionLabel(index: number): string {
  return `No${index + 1}`;
}
