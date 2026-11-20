/** 从 assets 目录 glob 结果解析序号或文件名 id */

export function indexMapFromAssetGlob(
  modules: Record<string, string>,
): Map<number, string> {
  return new Map(
    Object.entries(modules).flatMap(([path, src]) => {
      const file = path.split('/').pop() || '';
      const base = file.replace(/\.[^.]+$/, '');
      const idx = Number.parseInt(base, 10);
      return Number.isNaN(idx) ? [] : [[idx, src] as const];
    }),
  );
}

export function idMapFromAssetGlob(modules: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, src] of Object.entries(modules)) {
    const file = path.split('/').pop() || '';
    const id = file.replace(/\.[^.]+$/, '');
    if (id) map.set(id, src);
  }
  return map;
}
