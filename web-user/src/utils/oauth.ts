import type { StatusInfo } from '../types';

/**
 * 根据提供商类型、后端状态和 state 参数，生成 OAuth 跳转 URL
 */
export function getOAuthUrl(
  provider: string,
  status: StatusInfo,
  state: string,
): string | null {
  const origin = window.location.origin;

  switch (provider) {
    case 'github':
      return `https://github.com/login/oauth/authorize?client_id=${status.github_client_id}&state=${state}&scope=user:email`;

    case 'discord': {
      const redirectUri = encodeURIComponent(`${origin}/oauth/discord`);
      return `https://discord.com/oauth2/authorize?client_id=${status.discord_client_id}&redirect_uri=${redirectUri}&response_type=code&scope=identify+openid&state=${state}`;
    }

    case 'linuxdo':
      return `https://connect.linux.do/oauth2/authorize?response_type=code&client_id=${status.linuxdo_client_id}&state=${state}`;

    case 'oidc': {
      const url = new URL(status.oidc_authorization_endpoint);
      url.searchParams.set('client_id', status.oidc_client_id);
      url.searchParams.set('redirect_uri', `${origin}/oauth/oidc`);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid profile email');
      url.searchParams.set('state', state);
      return url.toString();
    }

    case 'wechat':
      // 微信登录通常由后端处理二维码，这里跳转到后端 OAuth 入口
      return `/api/oauth/wechat?state=${state}`;

    case 'telegram':
      // Telegram 使用 widget，这里不需要跳转 URL
      return null;

    default:
      return null;
  }
}
