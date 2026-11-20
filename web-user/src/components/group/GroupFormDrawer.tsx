import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import { createAdminGroup, updateAdminGroup } from '../../api';
import type { AdminGroup } from '../../types';

const GROUP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const RATIO_STEP = 0.01;
const RATIO_PRECISION = 4;

const ratioInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

const groupNameRules = (t: (key: string) => string) => [
  { required: true, whitespace: true, message: t('fieldRequired') },
  {
    validator: (_: unknown, value: string) => {
      const name = (value ?? '').trim();
      if (!name) return Promise.resolve();
      if (name === 'auto') return Promise.reject(new Error(t('groupNameReservedAuto')));
      if (!GROUP_NAME_PATTERN.test(name)) {
        return Promise.reject(new Error(t('groupNameInvalid')));
      }
      return Promise.resolve();
    },
  },
];

export type GroupFormValues = {
  name?: string;
  description?: string;
  ratio?: number;
  topup_ratio?: number;
  priority?: string;
  user_selectable?: boolean;
  auto_enabled?: boolean;
  enabled?: boolean;
  visible?: boolean;
  cache_enabled?: boolean;
  sort_order?: number;
};

const PRIORITY_INPUT_MAX_LEN = 10;

/** 输入过程中仅保留数字字符 */
function sanitizePriorityDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, PRIORITY_INPUT_MAX_LEN);
}

/** 失焦时规范为非负整数字符串（去掉前导零） */
function normalizePriorityValue(value: unknown): string {
  const digits = sanitizePriorityDigits(value);
  if (digits === '') return '';
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n < 0) return '';
  return String(n);
}

/** 解析优先级（提交用） */
function parsePriorityInput(value: string | undefined): number | null {
  const normalized = normalizePriorityValue(value);
  if (normalized === '') return null;
  const n = Number(normalized);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

const priorityInputBlockedKeys = new Set(['e', 'E', '+', '-', '.', ' ']);

function handlePriorityKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (priorityInputBlockedKeys.has(e.key)) {
    e.preventDefault();
  }
}

export interface GroupFormDrawerProps {
  open: boolean;
  record: AdminGroup | null; 
  onClose: () => void;
  onSuccess: () => void;
}

/** 分组新增 / 编辑抽屉（业务层，基于 FormDrawer） */
export function GroupFormDrawer({ open, record, onClose, onSuccess }: GroupFormDrawerProps) {
  const { t } = useTranslation();
  const [form] = Form.useForm<GroupFormValues>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (record) {
      form.setFieldsValue({
        name: record.name,
        description: record.description || '',
        ratio: record.ratio,
        topup_ratio: record.topup_ratio,
        user_selectable: record.user_selectable,
        auto_enabled: record.auto_enabled,
        enabled: record.enabled,
        visible: record.visible,
        cache_enabled: record.cache_enabled,
        sort_order: record.sort_order ?? 0,
        priority: String(record.priority ?? 0),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        ratio: 1,
        topup_ratio: 1,
        priority: '0',
        user_selectable: false,
        auto_enabled: false,
        enabled: true,
        visible: false,
        cache_enabled: false,
        sort_order: 0,
      });
    }
  }, [open, record, form]);

  const handleFinish = async (fv: GroupFormValues) => {
    const priority = parsePriorityInput(fv.priority);
    if (priority === null) {
      notifyApiError(t('groupPriorityInvalid'));
      return;
    }

    setSubmitting(true);
    try {
      if (record) {
        const payload: Record<string, unknown> = {
          description: fv.description?.trim() ?? '',
          ratio: fv.ratio ?? 1,
          topup_ratio: fv.topup_ratio ?? 1,
          priority,
          user_selectable: !!fv.user_selectable,
          auto_enabled: !!fv.auto_enabled,
          enabled: !!fv.enabled,
          visible: !!fv.visible,
          cache_enabled: !!fv.cache_enabled,
          sort_order: fv.sort_order != null ? Number(fv.sort_order) : 0,
        };
        const res = await updateAdminGroup(record.id, payload);
        if (res.data.success) {
          notifyApiSuccess();
          onClose();
          onSuccess();
        } else {
          notifyApiError(res.data.message);
        }
      } else {
        const name = fv.name?.trim() ?? '';
        if (name === 'auto') {
          notifyApiError(t('groupNameReservedAuto'));
          setSubmitting(false);
          return;
        }
        const payload: Record<string, unknown> = {
          name,
          description: fv.description?.trim() ?? '',
          ratio: fv.ratio ?? 1,
          topup_ratio: fv.topup_ratio ?? 1,
          priority,
          user_selectable: !!fv.user_selectable,
          auto_enabled: !!fv.auto_enabled,
          enabled: fv.enabled !== false,
          visible: !!fv.visible,
          cache_enabled: !!fv.cache_enabled,
          sort_order: fv.sort_order != null ? Number(fv.sort_order) : 0,
        };
        const res = await createAdminGroup(payload);
        if (res.data.success) {
          notifyApiSuccess();
          onClose();
          onSuccess();
        } else {
          notifyApiError(res.data.message);
        }
      }
    } catch (err) {
      notifyApiErrorFromErr(err);
    }
    setSubmitting(false);
  };

  const title = record ? `${t('edit')} ${record.name}` : t('addGroup');
  const isEditing = !!record;
  const isDefaultGroup = record?.name === 'default';
  const nameFieldDisabled = isEditing || isDefaultGroup;

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
          name="name"
          label={t('groupName')}
          extra={
            isDefaultGroup
              ? t('groupNameDefaultImmutable')
              : isEditing
                ? t('groupNameEditImmutable')
                : undefined
          }
          rules={nameFieldDisabled ? [] : groupNameRules(t)}
        >
          <Input
            allowClear={!nameFieldDisabled}
            placeholder="vip"
            disabled={nameFieldDisabled}
            readOnly={nameFieldDisabled}
          />
        </Form.Item>
        <Form.Item name="description" label={t('groupDescription')}>
          <Input.TextArea rows={2} maxLength={255} showCount allowClear style={{ resize: 'none' }} />
        </Form.Item>
        <Form.Item
          name="ratio"
          label={t('billingRatio')}
          rules={[
            { required: true, message: t('fieldRequired') },
            { type: 'number', min: 0, message: t('fieldRequired') },
          ]}
        >
          <InputNumber style={ratioInputStyle} min={0} precision={RATIO_PRECISION} step={RATIO_STEP} />
        </Form.Item>
        <Form.Item
          name="topup_ratio"
          label={t('topupRatio')}
          rules={[
            { required: true, message: t('fieldRequired') },
            { type: 'number', min: 0, message: t('fieldRequired') },
          ]}
        >
          <InputNumber style={ratioInputStyle} min={0} precision={RATIO_PRECISION} step={RATIO_STEP} />
        </Form.Item>
        <Form.Item
          name="priority"
          label={t('priority')}
          extra={t('groupPriorityHint')}
          normalize={sanitizePriorityDigits}
          rules={[
            { required: true, whitespace: true, message: t('fieldRequired') },
            {
              validator: (_: unknown, value: string) => {
                if (parsePriorityInput(value) !== null) return Promise.resolve();
                return Promise.reject(new Error(t('groupPriorityInvalid')));
              },
            },
          ]}
        >
          <Input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            maxLength={PRIORITY_INPUT_MAX_LEN}
            allowClear
            onKeyDown={handlePriorityKeyDown}
            onBlur={(e) => {
              const next = normalizePriorityValue(e.target.value);
              form.setFieldValue('priority', next);
            }}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = sanitizePriorityDigits(e.clipboardData.getData('text'));
              if (!pasted) return;
              const input = e.currentTarget;
              const start = input.selectionStart ?? input.value.length;
              const end = input.selectionEnd ?? input.value.length;
              const merged = sanitizePriorityDigits(
                `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`,
              );
              form.setFieldValue('priority', merged);
            }}
          />
        </Form.Item>
        <Form.Item name="sort_order" label={t('groupSort')}>
          <InputNumber style={{ width: '100%' }} min={0} precision={0} step={1} />
        </Form.Item>
        <Form.Item name="user_selectable" label={t('userSelectable')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="auto_enabled" label={t('autoGroup')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item
          name="visible"
          label={t('groupVisible')}
          valuePropName="checked"
          extra={t('groupVisibleHint')}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="cache_enabled"
          label={t('groupCacheEnabled')}
          valuePropName="checked"
          extra={t('groupCacheEnabledHint')}
        >
          <Switch />
        </Form.Item>
        <Form.Item name="enabled" label={t('status')} valuePropName="checked">
          <Switch disabled={record?.name === 'default'} />
        </Form.Item>
      </Form>
    </FormDrawer>
  );
}
