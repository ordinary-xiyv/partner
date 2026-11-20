import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSelf, logout as apiLogout, getProfileExt } from '../api';
import type { User } from '../types';
import {
  isPlatformAdmin,
  isPlatformWorker,
  normalizeUserFromApi,
} from '../utils/permission';

export interface UserExt {
  account_type: 'individual' | 'enterprise';
  org_id: number;
  company_name: string;
  verified: boolean;
  /** 企业 billing 主账号（lc_organizations.owner_id） */
  is_org_billing_owner?: boolean;
  /** 在所属组织内为 owner/admin，可管理成员与「我的企业」成员列表 */
  is_org_manager?: boolean;
  /** 为任意企业有效成员（解决仅写入 lc_org_members 未改 account_type 的老数据） */
  is_org_member?: boolean;
}

interface UserContextType {
  user: User | null;
  userExt: UserExt | null;
  loading: boolean;
  isEnterprise: boolean;
  /** 与后端 is_org_manager 一致：组织 owner/admin，可进成员管理页 */
  isOrgOwner: boolean;
  /** 仅 billing 主账号可创建企业子账号（/org/mine/members POST） */
  isOrgBillingOwner: boolean;
  /** Finance/Sales/Operations/Admin/Root：平台工作人员，不走企业子账号流程 */
  isPlatformWorker: boolean;
  /** Admin/Root：平台管理员（PermPlatformAdmin） */
  isPlatformAdmin: boolean;
  /** @deprecated 使用 isPlatformWorker */
  isPlatformStaff: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  userExt: null,
  loading: true,
  isEnterprise: false,
  isOrgOwner: false,
  isOrgBillingOwner: false,
  isPlatformWorker: false,
  isPlatformAdmin: false,
  isPlatformStaff: false,
  login: () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userExt, setUserExt] = useState<UserExt | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSelf = async () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) {
        setLoading(false);
        return;
      }
      const res = await getSelf();
      if (res.data.success) {
        const userData = normalizeUserFromApi(res.data.data as Record<string, unknown>);
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        try {
          const extRes = await getProfileExt();
          if (extRes.data.success) {
            setUserExt(extRes.data.data as UserExt);
          }
        } catch { /* 扩展信息拉取失败不阻断 */ }
      } else {
        localStorage.removeItem('user');
        setUser(null);
        setUserExt(null);
      }
    } catch {
      localStorage.removeItem('user');
      setUser(null);
      setUserExt(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSelf();
  }, []);

  const handleLogin = (userData: User) => {
    const normalized = userData.permissions
      ? userData
      : normalizeUserFromApi(userData as unknown as Record<string, unknown>);
    setUser(normalized);
    localStorage.setItem('user', JSON.stringify(normalized));
    fetchSelf();
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch { /* ignore */ }
    setUser(null);
    setUserExt(null);
    localStorage.removeItem('user');
  };

  const isEnterprise =
    userExt?.account_type === 'enterprise' || Boolean(userExt?.is_org_member);
  const platformWorker = isPlatformWorker(user);
  const platformAdmin = isPlatformAdmin(user?.role);
  const isOrgOwner = Boolean(userExt?.is_org_manager) && !platformWorker;
  const isOrgBillingOwner = Boolean(userExt?.is_org_billing_owner) && !platformWorker;

  return (
    <UserContext.Provider
      value={{
        user,
        userExt,
        loading,
        isEnterprise,
        isOrgOwner,
        isOrgBillingOwner,
        isPlatformWorker: platformWorker,
        isPlatformAdmin: platformAdmin,
        isPlatformStaff: platformWorker,
        login: handleLogin,
        logout: handleLogout,
        refresh: fetchSelf,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
