import { t } from 'i18next';
import API from './index';
import { encryptPassword } from '../utils/transportCrypto';

export interface SetupStatus {
  status: boolean;
  root_init: boolean;
  database_type: string;
}

export interface SetupRequest {
  username: string;
  password: string;
  confirmPassword: string;
  SelfUseModeEnabled: boolean;
  DemoSiteEnabled: boolean;
  /** 安装向导阶段的 SMTP 配置（由 /api/setup 一并写入） */
  smtp_enabled?: boolean;
  smtp_server?: string;
  smtp_port?: string;
  smtp_account?: string;
  smtp_from?: string;
  smtp_token?: string;
  smtp_ssl?: boolean;
}

export interface SmtpConfig {
  SMTPServer: string;
  SMTPPort: string;
  SMTPAccount: string;
  SMTPFrom: string;
  SMTPToken: string;
  SMTPSSLEnabled: string;        // "true" | "false"
  EmailVerificationEnabled: string;
}

export const getSetupStatus = () =>
  API.get<{ success: boolean; data: SetupStatus }>('/api/setup');

export const postSetup = async (data: SetupRequest) => {
  const password_encrypted = await encryptPassword(data.password);
  const payload = { ...data, password_encrypted };
  delete (payload as Record<string, unknown>).password;
  return API.post<{ success: boolean; message: string }>('/api/setup', payload);
};

/** 逐条写入 Option（/api/option/ 每次只接受单条） */
export const saveOption = (key: string, value: string) =>
  API.put<{ success: boolean; message: string }>('/api/option/', { key, value });

/** 批量保存多条 Option */
export async function saveOptions(opts: Record<string, string>) {
  for (const [key, value] of Object.entries(opts)) {
    const res = await saveOption(key, value);
    if (!res.data.success) throw new Error(res.data.message || t('api.saveOptionFailed', { key }));
  }
}
