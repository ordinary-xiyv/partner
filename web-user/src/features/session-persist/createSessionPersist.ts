/** 会话列表：merge(内存, LS) → mutate → strip 落盘；内存态始终保留完整数据 */

export interface SessionPersistResult<TItem> {
  next: TItem[];
  persistOk: boolean;
}

export interface MutateSessionListOptions<TItem extends { id: string; createdAt: number }> {
  memSnapshot?: TItem[];
  load: () => TItem[];
  merge: (mem: TItem[], ls: TItem[]) => TItem[];
  stripForPersist: (items: TItem[]) => TItem[];
  save: (items: TItem[]) => boolean;
  emitPersist?: () => void;
  mutator: (prev: TItem[]) => TItem[];
  onSuppressSync?: {
    enter: () => void;
    exit: () => void;
  };
}

export function mutateSessionList<TItem extends { id: string; createdAt: number }>(
  options: MutateSessionListOptions<TItem>,
): SessionPersistResult<TItem> {
  const ls = options.load();
  const base =
    options.memSnapshot != null ? options.merge(options.memSnapshot, ls) : ls;
  const next = options.mutator(base);
  const toPersist = options.stripForPersist(next);

  options.onSuppressSync?.enter();
  let persistOk = true;
  try {
    persistOk = options.save(toPersist);
  } finally {
    options.onSuppressSync?.exit();
  }
  if (persistOk) {
    options.emitPersist?.();
  }

  return { next, persistOk };
}
