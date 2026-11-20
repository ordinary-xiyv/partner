import { useMemo } from 'react';
import { useUser } from '../contexts/UserContext';
import type { PlatformPermission } from '../types';
import {
  assignableRoles,
  canAssignRole,
  canManageRole,
  getFirstAdminLandingPath,
  getFirstSystemSettingsPath,
  hasAnyStaffPermission,
  hasPermissionForUser,
  isPlatformAdmin,
  isPlatformWorker,
  isRoot,
} from '../utils/permission';

export function usePermissions() {
  const { user } = useUser();

  return useMemo(
    () => ({
      user,
      role: user?.role ?? 0,
      has: (perm: PlatformPermission) => hasPermissionForUser(user, perm),
      hasAnyStaff: hasAnyStaffPermission(user),
      isPlatformWorker: isPlatformWorker(user),
      isPlatformAdmin: isPlatformAdmin(user?.role),
      isRoot: isRoot(user?.role),
      adminLandingPath: getFirstAdminLandingPath(user),
      systemSettingsLandingPath: getFirstSystemSettingsPath(user),
      canManageRole: (targetRole: number) => canManageRole(user, targetRole),
      canAssignRole: (newRole: number) => canAssignRole(user, newRole),
      assignableRoles: assignableRoles(user),
    }),
    [user],
  );
}
