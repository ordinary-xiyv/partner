import {notifyApiError, notifyApiSuccess, notifyApiErrorFromErr} from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useCallback, useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { createUser, getAdminGroups, manageUser, updateUser } from '../../api';
import { usePermissions } from '../../hooks/usePermissions';
import { getRoleName, RoleCommonUser } from '../../utils';
import { fromQuota, getCurrencySymbol, toQuota } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { AdminGroup, User } from '../../types';

const QUOTA_PRECISION = 4;
const QUOTA_STEP = 0.01;

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

export interface UserFormDrawerProps {
  open: boolean;
  editingUser: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface GroupSelectOption {
  value: string;
  label: string;
}

function buildGroupOptions(groups: AdminGroup[], currentGroup?: string): GroupSelectOption[] {
  const enabled = groups.filter((g) => g.enabled);
  const options: GroupSelectOption[] = enabled.map((g) => ({
    value: g.name,
    label: g.name,
  }));
  const current = (currentGroup ?? '').trim();
  if (current && !options.some((o) => o.value === current)) {
    options.unshift({ value: current, label: current });
  }
  return options;
}

type UserFormValues = {
  username: string;
  password?: string;
  display_name?: string;
  quota?: number;
  group: string;
  remark?: string;
  role?: number;
};

/** 用户新增 / 编辑抽屉（样式与 GroupFormDrawer 一致） */
export function UserFormDrawer({ open, editingUser, onClose, onSuccess }: UserFormDrawerProps) {
  const { t } = useTranslation();
  const { assignableRoles, canManageRole, canAssignRole } = usePermissions();
  const qpu = useQuotaPerUnit();
  const [form] = Form.useForm<UserFormValues>();

  const [submitting, setSubmitting] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupOptions, setGroupOptions] = useState<GroupSelectOption[]>([]);

  const roleOptions = assignableRoles.map((r) => ({
    value: r,
    label: t(getRoleName(r)),
  }));

  const showRoleField = editingUser
    ? canManageRole(editingUser.role)
    : assignableRoles.length > 0;

  const fetchGroupOptions = useCallback(async (currentGroup?: string) => {
    setGroupsLoading(true);
    try {
      const res = await getAdminGroups();
      if (res.data.success) {
        setGroupOptions(buildGroupOptions((res.data.data || []) as AdminGroup[], currentGroup));
      }
    } catch {
      /* ignore */
    }
    setGroupsLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (editingUser) {
      form.setFieldsValue({
        username: editingUser.username ?? '',
        display_name: editingUser.display_name ?? '',
        quota: fromQuota(editingUser.quota, qpu),
        group: editingUser.group?.trim() || 'default',
        remark: editingUser.remark ?? '',
        role: editingUser.role,
      });
      void fetchGroupOptions(editingUser.group);
    } else {
      form.resetFields();
      form.setFieldsValue({
        quota: 0,
        group: 'default',
        role: RoleCommonUser,
      });
      void fetchGroupOptions('default');
    }
  }, [open, editingUser, form, qpu, fetchGroupOptions]);

  const handleFinish = async (fv: UserFormValues) => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        username: fv.username.trim(),
        display_name: fv.display_name?.trim() ?? '',
        quota: toQuota(Number(fv.quota ?? 0), qpu),
        group: (fv.group ?? '').trim() || 'default',
      };
      if (!editingUser) {
        payload.password = fv.password;
        if (showRoleField && fv.role != null) {
          payload.role = fv.role;
        }
      }
      if (editingUser) {
        payload.id = editingUser.id;
        payload.remark = (fv.remark ?? '').trim();
      }
      const res = editingUser ? await updateUser(payload) : await createUser(payload);
      if (!res.data.success) {
        notifyApiError(res.data.message);
        setSubmitting(false);
        return;
      }

      const nextRole = fv.role;
      if (
        editingUser
        && showRoleField
        && nextRole != null
        && nextRole !== editingUser.role
        && canAssignRole(nextRole)
      ) {
        const roleRes = await manageUser({
          id: editingUser.id,
          action: 'set_role',
          value: nextRole,
        });
        if (!roleRes.data.success) {
          notifyApiError(roleRes.data.message);
          setSubmitting(false);
          return;
        }
      }

      notifyApiSuccess(t('operationSuccess'));
      onClose();
      onSuccess();
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setSubmitting(false);
  };

  const title = editingUser
    ? `${t('edit')} ${editingUser.username}`
    : `${t('create')} ${t('users')}`;

  return (
    <FormDrawer
      open={open}
      title={title}
      onClose={onClose}
      onSubmit={() => void form.submit()}
      loading={submitting}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        colon={false}
        labelAlign="left"
        validateTrigger={[]}
        onFinish={(v) => void handleFinish(v)}
      >
        <Form.Item
          name="username"
          label={t('userName')}
          rules={[{ required: true, whitespace: true, message: t('fieldRequired') }]}
        >
          <Input allowClear readOnly={!!editingUser} disabled={!!editingUser} />
        </Form.Item>
        {!editingUser && (
          <Form.Item
            name="password"
            label={t('password')}
            rules={[{ required: true, whitespace: true, message: t('fieldRequired') }]}
          >
            <Input.Password allowClear />
          </Form.Item>
        )}
        <Form.Item name="display_name" label={t('name')}>
          <Input allowClear />
        </Form.Item>
        <Form.Item
          name="quota"
          label={`${t('quota')} (${getCurrencySymbol()})`}
          rules={[
            { required: true, message: t('fieldRequired') },
            { type: 'number', min: 0, message: t('fieldRequired') },
          ]}
        >
          <InputNumber
            style={numberInputStyle}
            min={0}
            precision={QUOTA_PRECISION}
            step={QUOTA_STEP}
          />
        </Form.Item>
        <Form.Item
          name="group"
          label={t('group')}
          rules={[{ required: true, message: t('fieldRequired') }]}
        >
          <Select
            showSearch
            allowClear={false}
            optionFilterProp="label"
            placeholder={t('selectGroup')}
            loading={groupsLoading}
            options={groupOptions}
          />
        </Form.Item>
        {showRoleField && roleOptions.length > 0 && (
          <Form.Item
            name="role"
            label={t('role')}
            rules={[{ required: true, message: t('fieldRequired') }]}
          >
            <Select options={roleOptions} />
          </Form.Item>
        )}
        {editingUser && (
          <Form.Item name="remark" label={t('note')}>
            <Input allowClear placeholder={t('userRemarkPlaceholder')} />
          </Form.Item>
        )}
      </Form>
    </FormDrawer>
  );
}
