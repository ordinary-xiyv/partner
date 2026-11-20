const STORAGE_KEY = 'lynx.modelsConsoleEmbed';

/** 操作台内打开模型广场（侧栏 / 控制台「查看全部」） */
export function markModelsConsoleEmbed(): void {
  sessionStorage.setItem(STORAGE_KEY, '1');
}

/** 官网顶栏等入口：独立模型广场页 */
export function clearModelsConsoleEmbed(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function isModelsConsoleEmbed(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) === '1';
}
