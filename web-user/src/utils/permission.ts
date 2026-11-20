/**
 * 平台角色与权限。
 * billing / audit_read 等与后端 common.Permission 对齐；
 * redemption / distribution / gateway_tier 为前端展示粒度（后端仍归 billing，路由守卫仅前端生效）。
 */
import type { PlatformPermission, User } from '../types';
import { parseQuotaDisplay } from './quotaDisplay';

export type { PlatformPermission } from '../types';

export const RoleGuestUser = 0;
export const RoleCommonUser = 1;
export const RoleFinance = 6;
export const RoleSales = 7;
export const RoleOperations = 8;
export const RoleAdminUser = 10;
export const RoleRootUser = 100;

const PLATFORM_PERMISSION_KEYS: PlatformPermission[] = [
  'billing',
  'redemption',
  'distribution',
  'gateway_tier',
  'log_read_all',
  'audit_read',
  'user_manage',
  'platform_admin',
  'root',
  'settings',
  'channel_secrets',
];

const rolePermissions: Record<number, Partial<Record<PlatformPermission, boolean>>> = {
  [RoleGuestUser]: {},
  [RoleCommonUser]: {},
  [RoleFinance]: { billing: true },
  [RoleSales]: { log_read_all: true },
  [RoleOperations]: {
    log_read_all: true,
    user_manage: true,
    redemption: true,
    distribution: true,
  },
  [RoleAdminUser]: {
    billing: true,
    redemption: true,
    distribution: true,
    gateway_tier: true,
    log_read_all: true,
    audit_read: true,
    user_manage: true,
    platform_admin: true,
  },
  [RoleRootUser]: {
    billing: true,
    redemption: true,
    distribution: true,
    gateway_tier: true,
    log_read_all: true,
    audit_read: true,
    user_manage: true,
    platform_admin: true,
    root: true,
    settings: true,
    channel_secrets: true,
  },
};

const PLATFORM_WORKER_ROLES = new Set([
  RoleFinance,
  RoleSales,
  RoleOperations,
  RoleAdminUser,
  RoleRootUser,
]);

export function isValidRole(role: number): boolean {
  return role in rolePermissions;
}

export function buildPermissionsFromRole(role: number): Record<PlatformPermission, boolean> {
  const src = rolePermissions[role] ?? {};
  return PLATFORM_PERMISSION_KEYS.reduce(
    (acc, key) => {
      acc[key] = Boolean(src[key]);
      return acc;
    },
    {} as Record<PlatformPermission, boolean>,
  );
}

/** 解析 GetSelf 若返回平铺的平台 permission map */
export function parseFlatPlatformPermissions(raw: unknown): Partial<Record<PlatformPermission, boolean>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<PlatformPermission, boolean>> = {};
  let found = false;
  for (const key of PLATFORM_PERMISSION_KEYS) {
    if (typeof o[key] === 'boolean') {
      out[key] = o[key];
      found = true;
    }
  }
  return found ? out : undefined;
}

function parseCreatedAt(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? Math.floor(value / 1000) : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return n > 1e12 ? Math.floor(n / 1000) : n;
    }
    const ms = new Date(trimmed).getTime();
    return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  }
  return 0;
}

/** 合并 API 用户数据：补齐 permissions，保留遗留 permissions 到 permissionsMeta */
export function normalizeUserFromApi(data: Record<string, unknown>): User {
  const role = Number(data.role ?? RoleCommonUser);
  const fromRole = buildPermissionsFromRole(role);
  const legacyPermissions = data.permissions;
  const fromApi = parseFlatPlatformPermissions(legacyPermissions);
  const permissions = { ...fromRole, ...fromApi } as Record<PlatformPermission, boolean>;

  const { permissions: _legacy, ...rest } = data;
  const base = rest as unknown as User;
  const createdAt = parseCreatedAt(data.created_at ?? data.created_time ?? base.created_at);
  return {
    ...base,
    created_at: createdAt,
    phone: (data.phone as string | null | undefined) ?? base.phone,
    has_password: Boolean(data.has_password ?? base.has_password ?? false),
    role,
    permissions,
    quota_display: parseQuotaDisplay(data.quota_display) ?? base.quota_display,
    permissionsMeta:
      legacyPermissions && typeof legacyPermissions === 'object'
        ? (legacyPermissions as Record<string, unknown>)
        : undefined,
  };
}

export function hasPermissionByRole(role: number | undefined, perm: PlatformPermission): boolean {
  const r = role ?? 0;
  const perms = rolePermissions[r];
  if (!perms) return false;
  return Boolean(perms[perm]);
}

/** 优先读 user.permissions（GetSelf 平铺 map），否则按 role 本地矩阵兜底 */
export function hasPermissionForUser(
  user: User | null | undefined,
  perm: PlatformPermission,
): boolean {
  if (!user) return false;
  const explicit = user.permissions?.[perm];
  if (explicit === true) return true;
  if (explicit === false) return false;
  return hasPermissionByRole(user.role, perm);
}

export function hasAnyStaffPermission(userOrRole: User | number | null | undefined): boolean {
  if (userOrRole == null) return false;
  if (typeof userOrRole === 'number') {
    return PLATFORM_WORKER_ROLES.has(userOrRole) && Object.values(buildPermissionsFromRole(userOrRole)).some(Boolean);
  }
  if (userOrRole.permissions) {
    return PLATFORM_PERMISSION_KEYS.some((k) => userOrRole.permissions?.[k]);
  }
  return hasAnyStaffPermission(userOrRole.role);
}

/** 平台管理员：Admin / Root（PermPlatformAdmin） */
export function isPlatformAdmin(role?: number): boolean {
  return hasPermissionByRole(role, 'platform_admin');
}

/** 超级管理员：Root（PermRoot） */
export function isRoot(role?: number): boolean {
  return (role ?? 0) === RoleRootUser || hasPermissionByRole(role, 'root');
}

/**
 * 平台工作人员：Finance / Sales / Operations / Admin / Root，或任一平台 permission。
 * 用于企业侧栏、对公充值等与「个人企业子账号」隔离。
 */
export function isPlatformWorker(userOrRole: User | number | null | undefined): boolean {
  if (userOrRole == null) return false;
  if (typeof userOrRole === 'number') {
    return PLATFORM_WORKER_ROLES.has(userOrRole) && hasAnyStaffPermission(userOrRole);
  }
  return hasAnyStaffPermission(userOrRole);
}

/** @deprecated 使用 isPlatformWorker */
export function isPlatformStaff(userOrRole: User | number | null | undefined): boolean {
  return isPlatformWorker(userOrRole);
}

export function hasPlatformAdmin(userOrRole: User | number | null | undefined): boolean {
  if (userOrRole == null) return false;
  if (typeof userOrRole === 'number') return isPlatformAdmin(userOrRole);
  return hasPermissionForUser(userOrRole, 'platform_admin');
}

function roleRank(role: number): number {
  switch (role) {
    case RoleGuestUser:
      return 0;
    case RoleCommonUser:
      return 1;
    case RoleFinance:
    case RoleSales:
      return 2;
    case RoleOperations:
      return 3;
    case RoleAdminUser:
      return 9;
    case RoleRootUser:
      return 10;
    default:
      return -1;
  }
}

export function canManageRole(actor: User | number | null | undefined, target: number): boolean {
  const a = typeof actor === 'number' ? actor : actor?.role ?? 0;
  if (a === RoleRootUser) return true;
  const canManage = typeof actor === 'object' && actor
    ? hasPermissionForUser(actor, 'user_manage')
    : hasPermissionByRole(a, 'user_manage');
  if (!canManage) return false;
  const ar = roleRank(a);
  const tr = roleRank(target);
  if (ar < 0 || tr < 0) return false;
  return ar > tr;
}

export function assignableRoles(actor: User | number | null | undefined): number[] {
  const a = typeof actor === 'number' ? actor : actor?.role ?? 0;
  switch (a) {
    case RoleRootUser:
      return [RoleCommonUser, RoleFinance, RoleSales, RoleOperations, RoleAdminUser];
    case RoleAdminUser:
      return [RoleCommonUser, RoleFinance, RoleSales, RoleOperations];
    default:
      if (typeof actor === 'object' && actor
        ? hasPermissionForUser(actor, 'user_manage')
        : hasPermissionByRole(a, 'user_manage')) {
        return [RoleCommonUser];
      }
      return [];
  }
}

export function canAssignRole(actor: User | number | null | undefined, newRole: number): boolean {
  return assignableRoles(actor).includes(newRole);
}

/** i18n key（与交接文档一致） */
export function getRoleName(role: number): string {
  if (role === RoleRootUser) return 'rootUser';
  if (role === RoleAdminUser) return 'adminUser';
  if (role === RoleOperations) return 'operationsUser';
  if (role === RoleSales) return 'salesUser';
  if (role === RoleFinance) return 'financeUser';
  if (role === RoleCommonUser) return 'normalUser';
  if (role === RoleGuestUser) return 'roleGuest';
  return 'roleUnknown';
}

export function getRoleTagColor(role: number): string {
  if (role === RoleRootUser) return 'red';
  if (role === RoleAdminUser) return 'blue';
  if (role === RoleOperations) return 'purple';
  if (role === RoleSales) return 'cyan';
  if (role === RoleFinance) return 'gold';
  if (role === RoleCommonUser) return 'green';
  return 'default';
}

/** 日志汇总页：仅超级管理员与运营 */
export function canAccessLogSummaries(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.role === RoleRootUser || user.role === RoleOperations;
}

/** 管理后台快捷入口：当前用户可访问的第一个后台页 */
export function getFirstAdminLandingPath(user: User | null | undefined): string | undefined {
  const candidates: { perm: PlatformPermission; path: string }[] = [
    { perm: 'platform_admin', path: '/channels' },
    { perm: 'user_manage', path: '/users' },
    { perm: 'billing', path: '/admin/billing' },
    { perm: 'audit_read', path: '/audit-logs' },
    { perm: 'root', path: '/settings/operation' },
  ];
  for (const { perm, path } of candidates) {
    if (hasPermissionForUser(user, perm)) return path;
  }
  return undefined;
}

/** 系统设置快捷入口：与侧栏「系统设置」子菜单顺序一致 */
export function getFirstSystemSettingsPath(user: User | null | undefined): string | undefined {
  if (!user) return undefined;
  if (user.role === RoleFinance) return undefined;
  if (hasPermissionForUser(user, 'root')) return '/settings/general';
  if (hasPermissionForUser(user, 'billing')) return '/settings/payment';
  return undefined;
}

export const ALL_PLATFORM_ROLES: number[] = [
  RoleGuestUser,
  RoleCommonUser,
  RoleFinance,
  RoleSales,
  RoleOperations,
  RoleAdminUser,
  RoleRootUser,
];
