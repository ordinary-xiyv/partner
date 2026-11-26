/**
 * Organizations.tsx
 *
 * 三种视图：
 * 1. 平台用户运营（user_manage：Operations/Admin/Root）→ 查看/管理所有组织
 * 2. 企业 owner/admin（is_org_manager）→ 成员管理；仅「创建子账号」拉新用户；改角色仅 billing owner；组织 admin 创建时仅可选 member/viewer
 * 3. 企业 viewer/member（!is_org_manager）→ 只读查看企业信息
 */
import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import {
  Table, Button, Typography, Tag, Space, Tooltip, Drawer,
  Input, Flex, theme,
} from 'antd';
import { AppEmpty, AppPageHeader } from '../ui/appLayout';
import { AsyncTableCard } from '../components/AsyncTableCard';
import { useTableColumnVisibility } from '../hooks/useTableColumnVisibility';
import type { ManagedColumnType } from '../utils/tableColumnVisibility';
import { LayoutMainOutletSection } from '../ui/layoutMainContent';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';

import {
  getOrgs, updateOrg, deleteOrg,
  getOrgMembers, resetMemberPassword,
  removeOrgSubAccount, removeOrgMember,
} from '../api';
import API from '../api';
import { formatTime, toQuota, fromQuota, renderAmount } from '../utils';
import { QuotaAmount } from '../components/QuotaAmount';
import { hasPermission } from '../utils';
import { validatePasswordComplexity } from '../utils/passwordPolicy';
import { localListPagination, controlledListPagination } from '../utils/tablePagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useQuotaPerUnit } from '../contexts/StatusContext';
import { useCurrency } from '../hooks/useCurrency';
import { useUser } from '../contexts/UserContext';
import type { Organization, OrgMember } from '../types';
import { TableRowActions } from '../components/TableRowActions';
import { FormDrawer } from '../ui/FormDrawer';
import { OrgPoolQuotaAdjustDrawer } from '../components/org/OrgPoolQuotaAdjustDrawer';
import { OrgMemberQuotaAdjustDrawer } from '../components/org/OrgMemberQuotaAdjustDrawer';

const { Title, Text } = Typography;
type TranslateFn = ReturnType<typeof useTranslation>['t'];

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 16,
  overflow: 'hidden',
};

// ─────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────
interface OrgMemberWithUser extends OrgMember {
  username?: string;
  display_name?: string;
  email?: string;
}

const ORG_MEMBER_ROLE_WEIGHT: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

const ORG_ROLE_TAG: Record<string, { key: string; color: 'blue' | 'green' | 'grey' }> = {
  admin: { key: 'org.roleAdmin', color: 'blue' },
  member: { key: 'org.roleMember', color: 'green' },
  viewer: { key: 'org.roleViewer', color: 'grey' },
};

function renderOrgRoleTag(role: string, t: TranslateFn) {
  if (role === 'owner') {
    return (
      <Tag
        style={{
          margin: 0,
          color: '#92400e',
          background: '#fef3c7',
          borderColor: '#fbbf24',
          fontWeight: 600,
        }}
      >
        {t('org.roleOwner')}
      </Tag>
    );
  }
  const item = ORG_ROLE_TAG[role] || { key: '', color: 'grey' as const };
  return <Tag color={item.color}>{item.key ? t(item.key) : role}</Tag>;
}

function renderOrgStatusTag(status: number, t: TranslateFn) {
  return (
    <Tag color={status === 1 ? 'green' : 'red'}>
      {status === 1 ? t('org.activeStatus') : t('org.disabledLabel')}
    </Tag>
  );
}

function sortOrgMembersByRolePriority(list: OrgMemberWithUser[]): OrgMemberWithUser[] {
  return [...list].sort((a, b) => {
    const roleDelta = (ORG_MEMBER_ROLE_WEIGHT[b.role] ?? 0) - (ORG_MEMBER_ROLE_WEIGHT[a.role] ?? 0);
    if (roleDelta !== 0) return roleDelta;
    const createdDelta = (Number(b.created_at) || 0) - (Number(a.created_at) || 0);
    if (createdDelta !== 0) return createdDelta;
    return Number(a.user_id) - Number(b.user_id);
  });
}

/** 成员个人配额限制之和；「已分配额度」展示时可排除 owner（企业拥有者不记入已分配给子账号的额度）。 */
function sumMembersQuotaLimit(members: OrgMemberWithUser[], excludeOwner = false): number {
  return members.reduce((sum, member) => {
    if (excludeOwner && member.role === 'owner') return sum;
    return sum + Number(member.quota_limit || 0);
  }, 0);
}

/** 有个人额度成员的剩余额度之和：max(quota_limit - used_quota, 0)。新建子账号时可排除 owner（拥有者不占「可向下分配」池内剩余口径）。 */
function sumMembersAllocatedRemain(
  members: OrgMemberWithUser[],
  excludeUserId: number | null = null,
  opts?: { excludeOwner?: boolean },
): number {
  return members.reduce((sum, member) => {
    if (excludeUserId != null && member.user_id === excludeUserId) return sum;
    if (opts?.excludeOwner && member.role === 'owner') return sum;
    const quotaLimit = Number(member.quota_limit || 0);
    if (quotaLimit <= 0) return sum;
    const usedQuota = Number(member.used_quota || 0);
    return sum + Math.max(0, quotaLimit - usedQuota);
  }, 0);
}

/**
 * 组织剩余池额度：优先用后端算好的 pool_remaining，缺失时退化为 quota − used_quota。
 */
function orgPoolRemaining(org: Organization | null | undefined): number {
  if (!org) return 0;
  if (org.pool_remaining != null && Number.isFinite(org.pool_remaining)) {
    return org.pool_remaining;
  }
  return Number(org.quota || 0) - Number(org.used_quota || 0);
}

function renderMemberRemaining(
  row: OrgMemberWithUser,
  qpu: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const rem = Number(row.remaining_quota ?? 0);
  const maxAdj = row.available_quota_limit;
  const inner = <QuotaAmount quotaUnits={rem} qpu={qpu} digits={4} />;
  if (maxAdj != null && Number.isFinite(Number(maxAdj))) {
    return (
      <Tooltip title={t('org.remainingQuotaHint', { max: renderAmount(Number(maxAdj), 4, qpu) })}>
        <span style={{ cursor: 'help', borderBottom: '1px dashed var(--border-default)' }}>{inner}</span>
      </Tooltip>
    );
  }
  return inner;
}

/**
 * 个人配额上限（quota 内部单位）：总池 − 已消耗 − 其他有限额成员剩余额度 + 当前成员已用额度。
 * 后端返回 available_quota_limit 时优先使用后端值，保持校验和展示一致。
 * 企业总池为 0 时视为无上限，返回 null（不做前端封顶）。
 */
function computeMaxMemberQuotaUnits(
  org: Organization,
  members: OrgMemberWithUser[],
  editingUserId: number | null,
): number | null {
  if (org.quota <= 0) return null;
  const target = editingUserId != null ? members.find((m) => m.user_id === editingUserId) : undefined;
  if (target && target.available_quota_limit != null) return Number(target.available_quota_limit);
  const allocatedRemain = sumMembersAllocatedRemain(
    members,
    editingUserId,
    editingUserId == null ? { excludeOwner: true } : undefined,
  );
  const targetUsed = target ? Number(target.used_quota || 0) : 0;
  return Math.max(
    0,
    Number(org.quota || 0) - Number(org.used_quota || 0) - allocatedRemain,
  ) + targetUsed;
}

// ─────────────────────────────────────────────
// 企业 Owner 视图
// ─────────────────────────────────────────────
const selectFieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  padding: '10px 14px',
  fontSize: 14,
};

function OrgOwnerView() {
  const { isOrgBillingOwner, isOrgOwner, user } = useUser();
  const { t, i18n } = useTranslation();
  const qpu = useQuotaPerUnit();
  const cc = useCurrency();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  // 创建子账号的入口已移除，submitting 一并删掉（它只服务于那个流程）

  const [roleEditTarget, setRoleEditTarget] = useState<OrgMemberWithUser | null>(null);
  const [roleEditValue, setRoleEditValue] = useState('member');
  const [roleEditRemark, setRoleEditRemark] = useState('');
  const [roleEditSubmitting, setRoleEditSubmitting] = useState(false);
  const roleEditRef = useRef(false);

  // 重置密码弹窗
  const [resetPwdTarget, setResetPwdTarget] = useState<OrgMemberWithUser | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const pwdSubmittingRef = useRef(false);

  // 成员额度管理
  const [quotaEditTarget, setQuotaEditTarget] = useState<OrgMemberWithUser | null>(null);

  // 新建成员表单（已随按钮一起移除，见 page header 处的注释）

  const resetPwdFormRef = useRef<HTMLFormElement>(null);
  const roleEditFormRef = useRef<HTMLFormElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, membersRes] = await Promise.all([
        API.get('/api/lynx/org/mine'),
        API.get('/api/lynx/org/mine/members'),
      ]);
      if (orgRes.data.success) setOrg(orgRes.data.data);
      if (membersRes.data.success) setMembers(sortOrgMembersByRolePriority(membersRes.data.data || []));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdSubmittingRef.current || !resetPwdTarget) return;
    if (newPwd.length < 8) {
      notifyApiError(t('org.passwordMinChars'), { toastId: 'pwd-err' });
      return;
    }
    const complexityError = validatePasswordComplexity(newPwd);
    if (complexityError) {
      notifyApiError(t(complexityError), { toastId: 'pwd-err' });
      return;
    }
    pwdSubmittingRef.current = true; setPwdSubmitting(true);
    try {
      const res = await resetMemberPassword(resetPwdTarget.user_id, newPwd);
      if (res.data.success) {
        notifyApiSuccess(t('org.resetPasswordTitle', { username: resetPwdTarget.username }));
        setResetPwdTarget(null); setNewPwd('');
      } else notifyApiError(res.data.message || t('org.resetFailed'), { toastId: 'pwd-err' });
    } catch (err) { notifyApiErrorFromErr(err, { fallbackKey: 'org.resetFailed', toastId: 'pwd-err' }); }
    finally { setPwdSubmitting(false); pwdSubmittingRef.current = false; }
  };

  const handleToggleStatus = async (row: OrgMemberWithUser) => {
    if (row.user_id === user?.id && row.status === 1) {
      notifyApiError(t('org.cannotDisableSelf'));
      return;
    }
    const newStatus = row.status === 1 ? 2 : 1;
    try {
      const res = await API.put(`/api/lynx/org/mine/members/${row.user_id}/quota`, {
        quota_limit: row.quota_limit,
        status: newStatus,
        remark: '',
      });
      if (res.data.success) {
        notifyApiSuccess(newStatus === 1 ? t('org.enabled') : t('org.disabledStatus'));
        fetchAll();
      }
      else notifyApiError(res.data.message);
    } catch (err) { notifyApiErrorFromErr(err, { fallbackKey: 'org.operationFailed' }); }
  };

  const handleRemoveMember = async (row: OrgMemberWithUser) => {
    if (row.role === 'owner') {
      notifyApiError(t('org.operationFailed'));
      return;
    }
    if (row.user_id === user?.id) {
      notifyApiError(t('org.cannotDisableSelf'));
      return;
    }
    try {
      const res = await removeOrgSubAccount(row.user_id);
      if (res.data.success) {
        notifyApiSuccess(t('org.removed'));
        fetchAll();
      } else {
        notifyApiError(res.data.message || t('org.operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'org.operationFailed' });
    }
  };

  const handleSaveMemberRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roleEditRef.current || !org || !roleEditTarget) return;
    roleEditRef.current = true;
    setRoleEditSubmitting(true);
    try {
      const res = await API.put(`/api/lynx/orgs/${org.id}/members/${roleEditTarget.user_id}`, {
        role: roleEditValue,
        remark: roleEditRemark.trim(),
      });
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        setRoleEditTarget(null);
        setRoleEditRemark('');
        fetchAll();
      } else notifyApiError(res.data.message || t('operationFailed'), { toastId: 'org-role' });
    } catch (err) { notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed', toastId: 'org-role' }); }
    finally {
      setRoleEditSubmitting(false);
      roleEditRef.current = false;
    }
  };

  const allColumns = useMemo<ManagedColumnType<OrgMemberWithUser>[]>(() => [
    {
      title: t('org.account'),
      dataIndex: 'username',
      key: 'username',
      width: 250,
      render: (v: string, row: OrgMemberWithUser) => {
        const line1 = v || `UID:${row.user_id}`;
        const tip = row.email ? `${line1}\n${row.email}` : line1;
        return (
          <Tooltip title={tip}>
            <div style={{ maxWidth: 200 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line1}</div>
              {row.email && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email}</div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: t('org.role'),
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (v: string) => renderOrgRoleTag(v, t),
    },
    {
      title: t('org.personalQuota'),
      dataIndex: 'quota_limit',
      key: 'quota_limit',
      width: 140,
      render: (v: number) => (
          <span>
              {renderAmount(v, 4, qpu)}
          </span>
      ),
    },
    {
      title: t('usedQuota'),
      dataIndex: 'used_quota',
      key: 'used_quota',
      width: 120,
      render: (v: number) => (
        <span>{renderAmount(Number(v || 0), 4, qpu)}</span>
      ),
    },
    {
      title: t('org.remainingQuota'),
      dataIndex: 'remaining_quota',
      key: 'remaining_quota',
      width: 140,
      render: (_: unknown, row: OrgMemberWithUser) => renderMemberRemaining(row, qpu, t),
    },
    {
      title: t('org.status'),
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: number) => renderOrgStatusTag(v, t),
    },
    {
      title: t('org.actions'),
      key: 'actions',
      width: 200,
      columnSettingsLocked: true,
      render: (_: unknown, row: OrgMemberWithUser) => {
        if (row.role === 'owner') {
          return (
            <Space className="org-row-actions" wrap>
              {/* <Button size="small" onClick={() => {
                setQuotaEditTarget(row);
                setQuotaEditVal(String(fromQuota(row.quota_limit, qpu)));
                setQuotaEditRemark('');
              }}>{t('org.quotaBtn')}</Button> */}
            </Space>
          );
        }
        if (!isOrgBillingOwner && row.role === 'admin' && row.user_id !== user?.id) {
          return <Text type="secondary" style={{ fontSize: 12 }}>{t('org.peerAdminNoManage')}</Text>;
        }
        return (
          <TableRowActions
            items={[
              isOrgBillingOwner && {
                key: 'role',
                label: t('org.changeRole'),
                onClick: () => {
                  setRoleEditTarget(row);
                  setRoleEditValue(row.role === 'admin' || row.role === 'viewer' || row.role === 'member' ? row.role : 'member');
                  setRoleEditRemark('');
                },
              },
              {
                key: 'quota',
                label: t('org.quotaBtn'),
                onClick: () => setQuotaEditTarget(row),
              },
              {
                key: 'pwd',
                label: t('org.changePwd'),
                onClick: () => { setResetPwdTarget(row); setNewPwd(''); },
              },
              {
                key: 'toggle',
                label: row.status === 1 ? t('org.disableBtn') : t('org.enableBtn'),
                disabled: row.user_id === user?.id && row.status === 1,
                onClick: () => handleToggleStatus(row),
              },
              row.user_id !== user?.id && {
                key: 'delete',
                label: t('delete'),
                danger: true,
                confirmTitle: t('org.removeConfirm'),
                onConfirm: () => void handleRemoveMember(row),
              },
            ]}
          />
        );
      },
    },
  ], [t, qpu, isOrgBillingOwner, isOrgOwner, user?.id, handleToggleStatus, handleRemoveMember]);

  const { columns, settingsControl } = useTableColumnVisibility({
    tableId: 'org-owner-members',
    columns: allColumns,
  });

  // 企业总池概览（已分配 = 除 owner 外成员个人配额限制之和）
  const membersAllocatedQuota = useMemo(() => sumMembersQuotaLimit(members, true), [members]);
  const orgPoolRemDisplay = org ? orgPoolRemaining(org) : 0;
  const orgQuotaDisplay = renderAmount(Number(org?.quota || 0), 4, qpu);
  const orgUsedDisplay = renderAmount(Number(org?.used_quota || 0), 4, qpu);
  const orgAllocatedDisplay = renderAmount(membersAllocatedQuota, 4, qpu);

  const maxEditMemberQuotaUnits = useMemo(
    () => (org && quotaEditTarget
      ? computeMaxMemberQuotaUnits(org, members, quotaEditTarget.user_id)
      : null),
    [org, members, quotaEditTarget],
  );

  return (
    <div className="org-management-page">
      <AppPageHeader
        title={t('org.membersTitle')}
        subtitle={t('org.memberManageHint')}
        actions={
          <Space className="org-page-actions" wrap>
            <Button icon={<ReloadOutlined />} onClick={fetchAll} loading={loading}>
              {t('org.refresh')}
            </Button>
            {settingsControl}
            {/*
             * 「新建成员账号」按钮已移除（2026-11-26）。
             *
             * 企业登录后不允许在这里自行创建子账号，成员由平台侧开通。
             * 对应的抽屉、二次确认、表单状态一并删除 —— 留着的话
             * createVisible 永远是 false，是一整段永远跑不到的死代码，
             * 以后读代码的人会以为这个功能还在。
             *
             * 如果将来要恢复：从 git 历史找回这一段按钮、下面的
             * 「新建子账号抽屉」与「确认创建」两个 FormDrawer，
             * 以及 newUsername/newPassword/... 那组表单状态。
             */}
          </Space>
        }
      />

      {org && (
        <div className="org-hero-panel lynx-page-panel" style={{ padding: '20px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', background: 'linear-gradient(180deg, rgb(from var(--theme-color-primary) r g b / 0.05) 0%, var(--bg-card) 68%)' }}>
          <div style={{ fontSize: 36 }}>🏢</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 20 }}>{org.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {t('org.orgIdCreated', { id: org.id, time: formatTime(org.created_at) })}
            </div>
          </div>
          <div className="org-summary-grid" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: t('org.used'), content: orgUsedDisplay },
              { label: t('org.orgPoolLabel'), content: orgQuotaDisplay },
              {
                label: t('org.poolRemaining'),
                content: (
                  <Tooltip title={t('org.poolRemainingHint')}>
                    <span><QuotaAmount quotaUnits={orgPoolRemDisplay} qpu={qpu} digits={4} /></span>
                  </Tooltip>
                ),
              },
              { label: t('org.allocated'), content: orgAllocatedDisplay },
            ].map((item) => (
              <div key={item.label} className="org-summary-card" style={{ ...panelStyle, minWidth: 130, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{item.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AsyncTableCard<OrgMemberWithUser>
        tableWrapClassName="org-responsive-table"
        tableProps={{
          columns,
          dataSource: members,
          loading,
          rowKey: 'id',
          scroll: { x: 'max(100%, 1040px)' },
          pagination: localListPagination(),
          locale: {
            /*
             * 用 noMembersHint 而不是 noMembers（2026-11-26）。
             *
             * 原文案是「先创建一个成员账号开始协作」，但创建按钮已经移除了 ——
             * 照着它去点会找不到入口，等于文案在误导用户。
             * 新文案说明「成员由平台侧开通」，指向真实可行的下一步。
             */
            emptyText: <AppEmpty icon="👥" message={t('org.noMembersHint')} />,
          },
        }}
      />

      {
        /* 「新建子账号抽屉」与「创建确认抽屉」已随按钮一起移除（2026-11-26）。
           恢复办法见 page header 处 onOpenChange 附近的注释。 */
      }
      {/* ── 重置密码抽屉 ── */}
      <FormDrawer
        title={t('org.resetPasswordTitle', { username: resetPwdTarget?.username || '' })}
        open={!!resetPwdTarget}
        onClose={() => { setResetPwdTarget(null); setNewPwd(''); }}
        onSubmit={() => resetPwdFormRef.current?.requestSubmit()}
        loading={pwdSubmitting}
        width={400}
      >
        <form ref={resetPwdFormRef} onSubmit={handleResetPassword}>
          <LabelInput
            label={t('org.newPasswordLabel')}
            type="password" value={newPwd} onChange={setNewPwd}
          />
        </form>
      </FormDrawer>

      {/* ── 修改成员角色（仅企业主账号 owner）── */}
      <FormDrawer
        title={t('org.changeMemberRole')}
        open={!!roleEditTarget}
        onClose={() => setRoleEditTarget(null)}
        onSubmit={() => roleEditFormRef.current?.requestSubmit()}
        loading={roleEditSubmitting}
        width={400}
      >
        <form ref={roleEditFormRef} onSubmit={handleSaveMemberRole} style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {roleEditTarget?.username || `UID:${roleEditTarget?.user_id}`}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('role')}</label>
            <select value={roleEditValue} onChange={(e) => setRoleEditValue(e.target.value)} style={selectFieldStyle}>
              <option value="viewer">{t('org.roleViewer')}</option>
              <option value="member">{t('org.roleMember')}</option>
              <option value="admin">{t('org.roleAdmin')}</option>
            </select>
          </div>
          <LabelInput
            label={t('note')}
            value={roleEditRemark}
            onChange={setRoleEditRemark}
            placeholder={t('optional')}
          />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('org.changeRoleOwnerHint')}</div>
        </form>
      </FormDrawer>

      <OrgMemberQuotaAdjustDrawer
        open={quotaEditTarget != null}
        org={org}
        member={quotaEditTarget}
        maxQuotaUnits={maxEditMemberQuotaUnits}
        onClose={() => setQuotaEditTarget(null)}
        onSuccess={fetchAll}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// 企业普通成员视图（只读）
// ─────────────────────────────────────────────
function OrgMemberView() {
  const { userExt } = useUser();
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMembersLoading(true);
    Promise.all([
      API.get('/api/lynx/org/mine'),
      API.get('/api/lynx/org/mine/members'),
    ])
      .then(([orgRes, memRes]) => {
        if (cancelled) return;
        if (orgRes.data.success) setOrg(orgRes.data.data);
        if (memRes.data.success) setMembers(sortOrgMembersByRolePriority(memRes.data.data || []));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setMembersLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const readonlyColumns = [
    {
      title: t('org.account'),
      dataIndex: 'username',
      width: 200,
      render: (v: string, row: OrgMemberWithUser) => {
        const line1 = v || `UID:${row.user_id}`;
        const tip = row.display_name ? `${line1}\n${row.display_name}` : line1;
        return (
          <Tooltip title={tip}>
            <div style={{ maxWidth: 200 }}>
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line1}</div>
              {row.display_name && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.display_name}</div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: t('org.role'),
      dataIndex: 'role',
      width: 120,
      render: (v: string) => renderOrgRoleTag(v, t),
    },
    {
      title: t('org.personalQuota'),
      dataIndex: 'quota_limit',
      width: 140,
      render: (v: number) => (
          <span>
            {renderAmount(v, 4, qpu)}
          </span>
      ),
    },
    {
      title: t('org.remainingQuota'),
      dataIndex: 'remaining_quota',
      width: 140,
      render: (_: unknown, row: OrgMemberWithUser) => renderMemberRemaining(row, qpu, t),
    },
    {
      title: t('org.status'),
      dataIndex: 'status',
      width: 90,
      render: (v: number) => renderOrgStatusTag(v, t),
    },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>{t('org.loading')}</div>;

  return (
    <div className="org-management-page">
      <AppPageHeader
        title={org?.name || userExt?.company_name || t('org.myOrganization')}
        subtitle={t('org.memberAccount')}
      />
      <div className="org-hero-panel org-hero-panel--center" style={{ ...panelStyle, padding: '36px 24px', textAlign: 'center', background: 'linear-gradient(180deg, rgb(from var(--theme-color-primary) r g b / 0.05) 0%, var(--bg-card) 72%)' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🏢</div>
        <Title level={3}>{org?.name || userExt?.company_name || t('org.myOrganization')}</Title>
        <Text type="secondary">{t('org.memberReadonlyHint')}</Text>
        {org && (
          <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-tertiary)' }}>
            {t('org.orgIdLabel', { id: org.id })}
          </div>
        )}
      </div>

      <div className="org-panel lynx-page-panel" style={{ ...panelStyle, marginTop: 20 }}>
        <div className="org-panel-header" style={{ padding: '14px 20px 0' }}>
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>{t('org.memberListReadonlyDesc')}</Text>
        </div>
        <div className="org-responsive-table">
          <Table
            columns={readonlyColumns}
            dataSource={members}
            loading={membersLoading}
            rowKey="id"
            pagination={localListPagination()}
            scroll={{ x: 'max(100%, 690px)' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 平台管理员视图（完整组织管理）
// ─────────────────────────────────────────────
function PlatformAdminView() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { user } = useUser();
  const qpu = useQuotaPerUnit();
  const cc = useCurrency();
  const [orgsOverview, setOrgsOverview] = useState<Organization[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedKeyword = useDebouncedValue(keyword.trim(), 300);
  const [convertVisible, setConvertVisible] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [convertUserId, setConvertUserId] = useState('');
  const [convertCompanyName, setConvertCompanyName] = useState('');
  const [editName, setEditName] = useState('');

  const [memberOrg, setMemberOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMemberWithUser[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [quotaOrg, setQuotaOrg] = useState<Organization | null>(null);
  const [editMemberTarget, setEditMemberTarget] = useState<OrgMemberWithUser | null>(null);
  const [editMemberRole, setEditMemberRole] = useState('member');
  const [editMemberStatus, setEditMemberStatus] = useState('1');
  const [editMemberQuota, setEditMemberQuota] = useState('');
  const [editMemberRemark, setEditMemberRemark] = useState('');
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState('member');
  const [addMemberQuota, setAddMemberQuota] = useState('');

  const addMemberFormRef = useRef<HTMLFormElement>(null);
  const editMemberFormRef = useRef<HTMLFormElement>(null);
  const convertFormRef = useRef<HTMLFormElement>(null);
  const editOrgFormRef = useRef<HTMLFormElement>(null);

  const fetchOrgsOverview = useCallback(async () => {
    try {
      const res = await getOrgs();
      if (res.data.success) setOrgsOverview(res.data.data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchOrgsList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (debouncedKeyword) params.keyword = debouncedKeyword;
      const res = await getOrgs(params);
      if (res.data.success) setOrgs(res.data.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [debouncedKeyword]);

  const refreshOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const listParams: Record<string, unknown> = {};
      if (debouncedKeyword) listParams.keyword = debouncedKeyword;
      const [overviewRes, listRes] = await Promise.all([getOrgs(), getOrgs(listParams)]);
      if (overviewRes.data.success) setOrgsOverview(overviewRes.data.data || []);
      if (listRes.data.success) setOrgs(listRes.data.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [debouncedKeyword]);

  useEffect(() => { void fetchOrgsOverview(); }, [fetchOrgsOverview]);
  useEffect(() => { void fetchOrgsList(); }, [fetchOrgsList]);

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword]);

  const fetchMembers = async (orgId: number) => {
    setMembersLoading(true);
    try {
      const res = await getOrgMembers(orgId);
      if (res.data.success) setMembers(sortOrgMembersByRolePriority(res.data.data || []));
    } catch { /* ignore */ }
    finally { setMembersLoading(false); }
  };

  const handleConvertUserToEnterprise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const uid = parseInt(convertUserId.trim(), 10);
    if (!Number.isFinite(uid) || uid <= 0) {
      notifyApiError(t('org.convertInvalidUserId'));
      return;
    }
    if (!convertCompanyName.trim()) {
      notifyApiError(t('org.enterOrgName'));
      return;
    }
    submittingRef.current = true; setSubmitting(true);
    try {
      const res = await API.post('/api/lynx/admin/enterprise/convert', {
        user_id: uid,
        company_name: convertCompanyName.trim(),
      });
      if (res.data.success) {
        notifyApiSuccess(typeof res.data.message === 'string' ? res.data.message : t('operationSuccess'));
        setConvertVisible(false);
        setConvertUserId('');
        setConvertCompanyName('');
        void refreshOrgs();
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    } finally {
      setSubmitting(false); submittingRef.current = false;
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrg || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true);
    try {
      const res = await updateOrg(editOrg.id, { name: editName });
      if (res.data.success) { notifyApiSuccess(t('operationSuccess')); setEditOrg(null); void refreshOrgs(); }
      else notifyApiError(res.data.message);
    } catch (err) { notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' }); }
    finally { setSubmitting(false); submittingRef.current = false; }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await deleteOrg(id);
      if (res.data.success) { notifyApiSuccess(t('deleteSuccess')); void refreshOrgs(); }
      else notifyApiError(res.data.message);
    } catch (err) { notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' }); }
  };

  const handleRemoveMember = async (row: OrgMemberWithUser) => {
    if (!memberOrg || row.role === 'owner') return;
    try {
      const res = await removeOrgMember(memberOrg.id, row.user_id);
      if (res.data.success) {
        notifyApiSuccess(t('org.removed'));
        void fetchMembers(memberOrg.id);
        void refreshOrgs();
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberOrg || !editMemberTarget || submittingRef.current) return;

    const normalized = editMemberQuota.trim();
    const numericQuota = normalized === '' ? 0 : Number(normalized);
    if (!Number.isFinite(numericQuota) || numericQuota < 0) {
      notifyApiError(t('org.invalidQuotaAmount'));
      return;
    }
    const maxUnits = computeMaxMemberQuotaUnits(memberOrg, members, editMemberTarget.user_id);
    if (maxUnits !== null && normalized !== '' && toQuota(numericQuota, qpu) > maxUnits) {
      notifyApiError(t('org.quotaExceedsRemaining', { max: renderAmount(maxUnits, 4, qpu) }));
      return;
    }

    submittingRef.current = true; setSubmitting(true);
    try {
      const isOwnerRow = editMemberTarget.role === 'owner';
      const res = await API.put(`/api/lynx/orgs/${memberOrg.id}/members/${editMemberTarget.user_id}`, {
        role: isOwnerRow ? 'owner' : editMemberRole,
        status: isOwnerRow ? editMemberTarget.status : Number(editMemberStatus),
        quota_limit: normalized === '' ? 0 : toQuota(numericQuota, qpu),
        remark: editMemberRemark.trim(),
      });
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        setEditMemberTarget(null);
        setEditMemberRole('member');
        setEditMemberStatus('1');
        setEditMemberQuota('');
        setEditMemberRemark('');
        fetchMembers(memberOrg.id);
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    } finally {
      setSubmitting(false); submittingRef.current = false;
    }
  };

  const handleAddExistingMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberOrg || submittingRef.current) return;

    const userId = Number(addMemberUserId.trim());
    const numericQuota = addMemberQuota.trim() === '' ? 0 : Number(addMemberQuota.trim());
    if (!Number.isInteger(userId) || userId <= 0) {
      notifyApiError(t('org.invalidUserId'));
      return;
    }
    if (!Number.isFinite(numericQuota) || numericQuota < 0) {
      notifyApiError(t('org.invalidQuotaAmount'));
      return;
    }
    const maxUnits = computeMaxMemberQuotaUnits(memberOrg, members, null);
    if (maxUnits !== null && addMemberQuota.trim() !== '' && toQuota(numericQuota, qpu) > maxUnits) {
      notifyApiError(t('org.quotaExceedsRemaining', { max: renderAmount(maxUnits, 4, qpu) }));
      return;
    }

    submittingRef.current = true; setSubmitting(true);
    try {
      const res = await API.post(`/api/lynx/orgs/${memberOrg.id}/members`, {
        user_id: userId,
        role: addMemberRole,
        quota_limit: addMemberQuota.trim() === '' ? 0 : toQuota(numericQuota, qpu),
      });
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        setAddMemberVisible(false);
        setAddMemberUserId('');
        setAddMemberRole('member');
        setAddMemberQuota('');
        fetchMembers(memberOrg.id);
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    } finally {
      setSubmitting(false); submittingRef.current = false;
    }
  };

  const allOrgColumns = useMemo<ManagedColumnType<Organization>[]>(
    () => [
      { title: 'ID', dataIndex: 'id', key: 'id', width: 56 },
      {
        title: t('org.name'),
        dataIndex: 'name',
        key: 'name',
        width: 200,
        ellipsis: true,
        render: (v: string) => <Text strong ellipsis={{ tooltip: v }}>{v}</Text>,
      },
      {
        title: t('org.orgPoolLabel'),
        dataIndex: 'quota',
        key: 'quota',
        width: 112,
        align: 'right' as const,
        sorter: (a: Organization, b: Organization) => Number(a.quota || 0) - Number(b.quota || 0),
        render: (v: number) => renderAmount(Number(v || 0), 4, qpu),
      },
      {
        title: t('usedQuota'),
        dataIndex: 'used_quota',
        key: 'used_quota',
        width: 112,
        align: 'right' as const,
        sorter: (a: Organization, b: Organization) => Number(a.used_quota || 0) - Number(b.used_quota || 0),
        render: (v: number) => renderAmount(Number(v || 0), 4, qpu),
      },
      {
        title: t('org.poolRemaining'),
        key: 'pool_remaining',
        width: 112,
        align: 'right' as const,
        sorter: (a: Organization, b: Organization) => orgPoolRemaining(a) - orgPoolRemaining(b),
        render: (_: unknown, row: Organization) => (
          <QuotaAmount quotaUnits={orgPoolRemaining(row)} qpu={qpu} digits={4} />
        ),
      },
      {
        title: t('org.status'),
        dataIndex: 'status',
        key: 'status',
        width: 80,
        render: (v: number) => renderOrgStatusTag(v, t),
      },
      {
        title: t('org.created'),
        dataIndex: 'created_at',
        key: 'created_at',
        width: 172,
        sorter: (a: Organization, b: Organization) => Number(a.created_at || 0) - Number(b.created_at || 0),
        render: (v: number) => formatTime(v),
      },
      {
        title: t('org.actions'),
        key: 'actions',
        width: 168,
        columnSettingsLocked: true,
        render: (_: unknown, row: Organization) => (
          <TableRowActions
            items={[
              {
                key: 'members',
                label: t('org.membersBtn'),
                onClick: () => { setMemberOrg(row); fetchMembers(row.id); },
              },
              {
                key: 'quota',
                label: t('org.quotaBtn'),
                onClick: () => setQuotaOrg(row),
              },
              {
                key: 'edit',
                label: t('org.edit'),
                onClick: () => { setEditOrg(row); setEditName(row.name); },
              },
              {
                key: 'delete',
                label: t('org.delete'),
                danger: true,
                confirmTitle: t('org.deleteOrgConfirm'),
                onConfirm: () => handleDelete(row.id),
              },
            ]}
          />
        ),
      },
    ],
    [t, qpu, fetchMembers, handleDelete, setMemberOrg, setQuotaOrg, setEditOrg, setEditName],
  );

  const { columns: orgColumns } = useTableColumnVisibility({
    tableId: 'org-platform-list',
    columns: allOrgColumns,
  });

  const memberColumns = [
    { title: 'UID', dataIndex: 'user_id', width: 70 },
    {
      title: t('org.username'),
      dataIndex: 'username',
      width: 160,
      ellipsis: true,
      render: (v: string, row: OrgMemberWithUser) => v || `UID:${row.user_id}`,
    },
    {
      title: t('org.role'),
      dataIndex: 'role',
      width: 100,
      render: (v: string) => renderOrgRoleTag(v, t),
    },
    {
      title: t('org.personalQuota'),
      dataIndex: 'quota_limit',
      width: 140,
      render: (v: number) => (v > 0 ? renderAmount(v, 4, qpu) : <Text type="secondary" style={{ fontSize: 12 }}>{t('org.orgPool')}</Text>),
    },
    {
      title: t('org.remainingQuota'),
      dataIndex: 'remaining_quota',
      width: 140,
      render: (_: unknown, row: OrgMemberWithUser) => renderMemberRemaining(row, qpu, t),
    },
    {
      title: t('org.status'),
      dataIndex: 'status',
      width: 80,
      render: (v: number) => renderOrgStatusTag(v, t),
    },
    {
      title: t('org.actions'),
      width: 160,
      render: (_: unknown, row: OrgMemberWithUser) => (
        <TableRowActions
          items={[
            {
              key: row.role === 'owner' ? 'quota' : 'edit',
              label: row.role === 'owner' ? t('org.quotaBtn') : t('edit'),
              onClick: () => {
                if (row.role === 'owner' && memberOrg) {
                  const freshOrg = orgsOverview.find((item) => item.id === memberOrg.id) ?? memberOrg;
                  setQuotaOrg(freshOrg);
                  return;
                }
                setEditMemberTarget(row);
                setEditMemberRole(row.role || 'member');
                setEditMemberStatus(String(row.status || 1));
                setEditMemberQuota(String(fromQuota(row.quota_limit, qpu)));
                setEditMemberRemark('');
              },
            },
            row.role !== 'owner' && {
              key: 'delete',
              label: t('delete'),
              danger: true,
              confirmTitle: t('org.removeConfirm'),
              onConfirm: () => void handleRemoveMember(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <LayoutMainOutletSection>
    <div className="org-management-page">
      <AppPageHeader
        title={t('org.organizationManagement')}
        subtitle={t('org.platformManageHint')}
      />

      <div className="org-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: token.marginMD }}>
        {[
          { label: t('org.organizationManagement'), value: String(orgsOverview.length) },
          { label: t('org.activeStatus'), value: String(orgsOverview.filter((item) => item.status === 1).length) },
          { label: t('usedQuota'), value: renderAmount(orgsOverview.reduce((sum, item) => sum + Number(item.used_quota || 0), 0), 4, qpu) },
        ].map((item) => (
          <div key={item.label} className="org-summary-card" style={{ ...panelStyle, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <AsyncTableCard<Organization>
        toolbarBordered={false}
        toolbar={(
          <Flex align="center" gap={12} wrap="wrap" className="lynx-list-toolbar lynx-list-toolbar--in-panel">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: token.colorTextSecondary }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('org.searchNamePlaceholder')}
              style={{ width: 220 }}
              aria-label={t('org.searchNamePlaceholder')}
            />
            <Space wrap style={{ marginLeft: 'auto' }}>
              <Button icon={<ReloadOutlined />} onClick={() => void refreshOrgs()} loading={loading}>
                {t('org.refresh')}
              </Button>
              <Button icon={<PlusOutlined />} type="primary" onClick={() => setConvertVisible(true)}>
                {t('org.convertToEnterprise')}
              </Button>
            </Space>
          </Flex>
        )}
        tableProps={{
          columns: orgColumns,
          dataSource: orgs,
          loading,
          rowKey: 'id',
          scroll: { x: 'max(100%, 1012px)' },
          pagination: controlledListPagination({
            current: page,
            pageSize,
            total: orgs.length,
            onChange: (p, nextSize) => {
              if (nextSize && nextSize !== pageSize) {
                setPageSize(nextSize);
                setPage(1);
              } else {
                setPage(p);
              }
            },
          }),
          locale: {
            emptyText: <AppEmpty icon="🏢" message={t('org.noOrganizations')} />,
          },
        }}
      />

      {/* 成员管理侧边抽屉 */}
      <Drawer
        title={`${memberOrg?.name || ''} — ${t('org.membersTitle')}`}
        open={!!memberOrg}
        onClose={() => setMemberOrg(null)}
        width={960}
        destroyOnClose
      >
        <div className="org-page-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddMemberVisible(true)}>
            {t('addMember')}
          </Button>
        </div>
        <div className="org-responsive-table">
          <Table columns={memberColumns} dataSource={members} loading={membersLoading} rowKey="id" pagination={localListPagination()} scroll={{ x: 'max(100%, 850px)' }} />
        </div>
      </Drawer>

      {/* 添加已有平台用户到组织 */}
      <FormDrawer
        title={`${t('addMember')} — ${memberOrg?.name || ''}`}
        open={addMemberVisible}
        onClose={() => {
          setAddMemberVisible(false);
          setAddMemberUserId('');
          setAddMemberRole('member');
          setAddMemberQuota('');
        }}
        onSubmit={() => addMemberFormRef.current?.requestSubmit()}
        loading={submitting}
        width={420}
      >
        <form ref={addMemberFormRef} onSubmit={handleAddExistingMember} style={{ display: 'grid', gap: 12 }}>
          <LabelInput
            label={t('userId')}
            type="number"
            value={addMemberUserId}
            onChange={setAddMemberUserId}
            placeholder="例如：12"
          />
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('role')}</label>
            <select value={addMemberRole} onChange={(e) => setAddMemberRole(e.target.value)} style={selectFieldStyle}>
              <option value="viewer">{t('org.roleViewer')}</option>
              <option value="member">{t('org.roleMember')}</option>
              <option value="admin">{t('org.roleAdmin')}</option>
            </select>
          </div>
          <LabelInput
            label={`${t('quotaLimit')}（${cc.symbol}）`}
            type="number"
            value={addMemberQuota}
            onChange={setAddMemberQuota}
            placeholder="0"
          />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('org.addExistingUserHint')}</div>
        </form>
      </FormDrawer>

      {/* 编辑成员 */}
      <FormDrawer
        title={`${t('edit')} — ${editMemberTarget?.username || `UID:${editMemberTarget?.user_id || ''}`}`}
        open={!!editMemberTarget}
        onClose={() => {
          setEditMemberTarget(null);
          setEditMemberRole('member');
          setEditMemberStatus('1');
          setEditMemberQuota('');
          setEditMemberRemark('');
        }}
        onSubmit={() => editMemberFormRef.current?.requestSubmit()}
        loading={submitting}
        width={420}
      >
        <form ref={editMemberFormRef} onSubmit={handleUpdateMember} style={{ display: 'grid', gap: 12 }}>
          {editMemberTarget?.role === 'owner' ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>{t('role')}</span>
                {': '}
                {t('org.roleOwner')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600 }}>{t('status')}</span>
                {': '}
                {renderOrgStatusTag(Number(editMemberTarget.status), t)}
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('role')}</label>
                <select value={editMemberRole} onChange={(e) => setEditMemberRole(e.target.value)} style={selectFieldStyle}>
                  <option value="viewer">{t('org.roleViewer')}</option>
                  <option value="member">{t('org.roleMember')}</option>
                  <option value="admin">{t('org.roleAdmin')}</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{t('status')}</label>
                <select value={editMemberStatus} onChange={(e) => setEditMemberStatus(e.target.value)} style={selectFieldStyle}>
                  <option value="1">{t('org.activeStatus')}</option>
                  <option value="2">{t('org.disabledLabel')}</option>
                </select>
              </div>
            </>
          )}
          <LabelInput
            label={`${t('quotaLimit')}（${cc.symbol}）`}
            type="number"
            value={editMemberQuota}
            onChange={setEditMemberQuota}
            placeholder="0"
          />
          <LabelInput
            label={t('note')}
            value={editMemberRemark}
            onChange={setEditMemberRemark}
            placeholder={t('optional')}
          />
        </form>
      </FormDrawer>

      {/* 管理员：将普通用户转为企业账号 */}
      <FormDrawer
        title={t('org.convertModalTitle')}
        open={convertVisible}
        onClose={() => { setConvertVisible(false); setConvertUserId(''); setConvertCompanyName(''); }}
        onSubmit={() => convertFormRef.current?.requestSubmit()}
        loading={submitting}
        width={440}
      >
        <form ref={convertFormRef} onSubmit={handleConvertUserToEnterprise} style={{ display: 'grid', gap: 14 }}>
          <LabelInput
            label={t('userId')}
            type="number"
            value={convertUserId}
            onChange={setConvertUserId}
            placeholder={t('org.convertUserIdPlaceholder')}
          />
          <LabelInput
            label={t('org.companyNameLabel')}
            value={convertCompanyName}
            onChange={setConvertCompanyName}
            placeholder={t('org.enterOrgNamePlaceholder')}
          />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {t('org.convertHint')}
          </div>
        </form>
      </FormDrawer>

      {/* 编辑组织 */}
      <FormDrawer
        title={t('org.editOrganization')}
        open={!!editOrg}
        onClose={() => setEditOrg(null)}
        onSubmit={() => editOrgFormRef.current?.requestSubmit()}
        loading={submitting}
        width={400}
      >
        <form ref={editOrgFormRef} onSubmit={handleUpdate}>
          <LabelInput
            label={t('org.orgNameLabel')}
            value={editName} onChange={setEditName}
            placeholder={t('org.orgNamePlaceholder')}
          />
        </form>
      </FormDrawer>

      <OrgPoolQuotaAdjustDrawer
        open={quotaOrg != null}
        org={quotaOrg}
        onClose={() => setQuotaOrg(null)}
        onSuccess={() => {
          void refreshOrgs();
          if (memberOrg) fetchMembers(memberOrg.id);
        }}
      />
    </div>
    </LayoutMainOutletSection>
  );
}

// ─────────────────────────────────────────────
// 辅助组件：带 label 的 input
// ─────────────────────────────────────────────
function LabelInput({ label, type = 'text', value, onChange, placeholder, min, max, step }: {
  label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  min?: number; max?: number; step?: number | string;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--bg-card)',
          border: `1px solid ${focused ? 'var(--border-hover)' : 'var(--border-default)'}`,
          borderRadius: 8, color: 'var(--text-primary)',
          padding: '10px 14px', fontSize: 14, outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// 主入口：根据角色分发视图
// ─────────────────────────────────────────────
export default function Organizations() {
  const { user, isEnterprise, isOrgOwner } = useUser();
  const { t } = useTranslation();
  const isPlatformAdmin = hasPermission(user, 'user_manage');

  if (isPlatformAdmin) return <PlatformAdminView />;
  if (isOrgOwner) return <OrgOwnerView />;
  if (isEnterprise) return <OrgMemberView />;

  // 个人用户：不应出现在这里（侧边栏已隐藏）
  return (
    <div className="org-management-page org-empty-state" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <Typography.Title level={4}>
        {t('org.enterpriseOnly')}
      </Typography.Title>
      <Typography.Text type="secondary">
        {t('org.contactForEnterprise')}
      </Typography.Text>
    </div>
  );
}
