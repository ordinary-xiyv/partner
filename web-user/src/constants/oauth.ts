import type { DeployMode, StatusInfo } from '../types';

export type OAuthProvider = 'github' | 'discord' | 'oidc' | 'linuxdo' | 'wechat' | 'telegram';

interface OAuthProviderConfig {
  key: OAuthProvider;
  label: string;
  labelEn: string;
  icon: string;
  color: string;
  // 哪些部署模式下可用
  modes: DeployMode[];
}

/** 全部 OAuth 提供商定义 */
export const OAUTH_PROVIDERS: OAuthProviderConfig[] = [
  {
    key: 'wechat',
    label: 'WeChat Login',
    labelEn: 'WeChat Login',
    icon: 'wechat',
    color: '#07c160',
    modes: ['domestic', 'overseas'],
  },
  {
    key: 'github',
    label: 'GitHub',
    labelEn: 'GitHub',
    icon: 'github',
    color: '#24292e',
    modes: ['overseas'],
  },
  {
    key: 'discord',
    label: 'Discord',
    labelEn: 'Discord',
    icon: 'discord',
    color: '#5865f2',
    modes: ['overseas'],
  },
  {
    key: 'oidc',
    label: 'OIDC',
    labelEn: 'OIDC',
    icon: 'oidc',
    color: '#f78c40',
    modes: ['overseas'],
  },
  {
    key: 'linuxdo',
    label: 'LinuxDO',
    labelEn: 'LinuxDO',
    icon: 'linuxdo',
    color: '#f5a623',
    modes: ['overseas'],
  },
  {
    key: 'telegram',
    label: 'Telegram',
    labelEn: 'Telegram',
    icon: 'telegram',
    color: '#0088cc',
    modes: ['overseas'],
  },
];

/** 获取当前部署模式 */
export function getDeployMode(): DeployMode {
  return import.meta.env.VITE_DEPLOY_MODE || 'overseas';
}

/** 根据部署模式 + 后端状态，返回当前可用的 OAuth 提供商列表 */
export function getAvailableOAuthProviders(status: StatusInfo | null): OAuthProviderConfig[] {
  if (!status) return [];

  const mode = getDeployMode();

  return OAUTH_PROVIDERS.filter((provider) => {
    // 1. 部署模式过滤
    if (!provider.modes.includes(mode)) return false;

    // 2. 后端开关过滤
    switch (provider.key) {
      case 'github':
        return status.github_oauth;
      case 'discord':
        return status.discord_oauth;
      case 'oidc':
        return status.oidc_enabled;
      case 'linuxdo':
        return status.linuxdo_oauth;
      case 'wechat':
        return status.wechat_login;
      case 'telegram':
        return status.telegram_oauth;
      default:
        return false;
    }
  });
}
