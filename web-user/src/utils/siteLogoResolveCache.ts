/** 站点 Logo 解析结果：跨 Header 挂载复用，避免路由切换重复请求 OSS */
export type SiteLogoResolveResult = 'remote' | 'broken';

const resolveCache = new Map<string, SiteLogoResolveResult>();

export function getSiteLogoResolve(remoteUrl: string): SiteLogoResolveResult | undefined {
  return resolveCache.get(remoteUrl);
}

export function setSiteLogoResolve(remoteUrl: string, result: SiteLogoResolveResult): void {
  resolveCache.set(remoteUrl, result);
}

export function clearSiteLogoResolve(remoteUrl?: string): void {
  if (remoteUrl) resolveCache.delete(remoteUrl);
  else resolveCache.clear();
}
