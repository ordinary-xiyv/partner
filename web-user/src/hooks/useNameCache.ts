/**
 * useNameCache — 批量预加载 ID→名称映射
 * 解决表格中显示 ID 而非名称的问题
 */
import { useEffect, useState, useCallback } from 'react';
import { searchUsers, getOrgs, getAdminPlans } from '../api';

interface NameCache {
  users: Record<number, string>;     // user_id → username
  orgs: Record<number, string>;      // org_id  → org name
  plans: Record<number, string>;     // plan_id → plan name
}

const cache: NameCache = { users: {}, orgs: {}, plans: {} };
let usersLoaded = false;
let orgsLoaded = false;
let plansLoaded = false;

export function useUserName(userId: number): string {
  const [name, setName] = useState<string>(cache.users[userId] || '');

  useEffect(() => {
    if (!userId) return;
    if (cache.users[userId]) { setName(cache.users[userId]); return; }
    // lazy load: search by id
    searchUsers({ keyword: String(userId) }).then((res) => {
      if (res.data.success) {
        const payload = res.data.data;
        const items: { id: number; username: string; display_name?: string }[] =
          Array.isArray(payload) ? payload : (payload?.items ?? []);
        items.forEach((u) => {
          cache.users[u.id] = u.display_name || u.username;
        });
        if (cache.users[userId]) setName(cache.users[userId]);
      }
    }).catch(() => {});
  }, [userId]);

  return name || `UID:${userId}`;
}

export function useOrgName(orgId: number): string {
  const [name, setName] = useState<string>(cache.orgs[orgId] || '');

  useEffect(() => {
    if (!orgId) return;
    if (cache.orgs[orgId]) { setName(cache.orgs[orgId]); return; }
    getOrgs().then((res) => {
      if (res.data.success) {
        const items: { id: number; name: string }[] = res.data.data || [];
        items.forEach((o) => { cache.orgs[o.id] = o.name; });
        if (cache.orgs[orgId]) setName(cache.orgs[orgId]);
      }
    }).catch(() => {});
  }, [orgId]);

  return name || `OrgID:${orgId}`;
}

// ── Batch preload hooks ────────────────────────────────────────

/** 预加载所有用户到 cache，返回 Record<id, name>（循环翻页，绕过单页 100 条限制） */
export function useUsersMap(): Record<number, string> {
  const [map, setMap] = useState<Record<number, string>>(cache.users);

  useEffect(() => {
    if (usersLoaded) { setMap({ ...cache.users }); return; }

    const loadAll = async () => {
      let page = 1;
      while (true) {
        const res = await searchUsers({ keyword: '', p: page, page_size: 100 });
        if (!res.data.success) break;
        const payload = res.data.data;
        const items: { id: number; username: string; display_name?: string }[] =
          Array.isArray(payload) ? payload : (payload?.items ?? []);
        items.forEach((u) => {
          cache.users[u.id] = u.display_name || u.username;
        });
        const total: number = payload?.total ?? items.length;
        if (Object.keys(cache.users).length >= total || items.length === 0) break;
        page++;
      }
      usersLoaded = true;
      setMap({ ...cache.users });
    };

    loadAll().catch(() => {});
  }, []);

  return map;
}

/** 预加载所有组织到 cache */
export function useOrgsMap(): Record<number, string> {
  const [map, setMap] = useState<Record<number, string>>(cache.orgs);

  useEffect(() => {
    if (orgsLoaded) { setMap({ ...cache.orgs }); return; }
    getOrgs().then((res) => {
      if (res.data.success) {
        const items: { id: number; name: string }[] = res.data.data || [];
        items.forEach((o) => { cache.orgs[o.id] = o.name; });
        orgsLoaded = true;
        setMap({ ...cache.orgs });
      }
    }).catch(() => {});
  }, []);

  return map;
}

/** 预加载所有套餐 */
export function usePlansMap(): Record<number, string> {
  const [map, setMap] = useState<Record<number, string>>(cache.plans);

  useEffect(() => {
    if (plansLoaded) { setMap({ ...cache.plans }); return; }
    getAdminPlans().then((res) => {
      if (res.data.success) {
        const items: { id: number; name: string }[] = res.data.data || [];
        items.forEach((p) => { cache.plans[p.id] = p.name; });
        plansLoaded = true;
        setMap({ ...cache.plans });
      }
    }).catch(() => {});
  }, []);

  return map;
}

// ── Select option builders ─────────────────────────────────────

export interface SelectOption { label: string; value: number; }

export function useUserOptions(): SelectOption[] {
  const map = useUsersMap();
  return Object.entries(map).map(([id, name]) => ({
    label: name,
    value: Number(id),
  })).sort((a, b) => a.label.localeCompare(b.label));
}

export function useOrgOptions(): SelectOption[] {
  const map = useOrgsMap();
  return Object.entries(map).map(([id, name]) => ({
    label: name,
    value: Number(id),
  })).sort((a, b) => a.label.localeCompare(b.label));
}

export function usePlanOptions(): SelectOption[] {
  const map = usePlansMap();
  return Object.entries(map).map(([id, name]) => ({
    label: name,
    value: Number(id),
  }));
}

/** 清空缓存（切换账号时调用） */
export function clearNameCache() {
  Object.assign(cache, { users: {}, orgs: {}, plans: {} });
  usersLoaded = false; orgsLoaded = false; plansLoaded = false;
}
