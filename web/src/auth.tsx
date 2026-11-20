import { createAuthContext } from '@lynx/shared';
import { fetchProfile } from '@lynx/shared/api/dealer';
import type { DealerProfile } from '@lynx/shared';

/** 经销商登录态。整端唯一实例，页面通过 useDealerAuth() 读取 */
export const { AuthProvider: DealerAuthProvider, useAuth: useDealerAuth } =
  createAuthContext<DealerProfile>();
