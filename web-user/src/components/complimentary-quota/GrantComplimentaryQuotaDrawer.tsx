import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DatePicker, Form, Input, InputNumber, Select, Space, Switch, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { FormDrawer } from '../../ui/FormDrawer';
import { grantComplimentaryQuota, updateComplimentaryQuota } from '../../api/complimentaryQuota';
import { searchUsers } from '../../api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { fromQuota, getCurrencySymbol, toQuota } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { ComplimentaryQuota } from '../../types';
import { COMPLIMENTARY_SOURCE_PRESETS } from './complimentaryDisplay';

const QUOTA_PRECISION = 4;
const QUOTA_STEP = 0.01;

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

type UserSearchOption = { label: string; value: number };

function parseSearchUserItems(data: unknown): Array<{ id: number; username: string; display_name?: string }> {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) ? items : [];
  }
  return [];
}

function toUserSearchOption(u: { id: number; username: string; display_name?: string }): UserSearchOption {
  const name = (u.username || '').trim() || `UID:${u.id}`;
  return { label: `${name} (#${u.id})`, value: u.id };
}

type FormValues = {
  user_id?: number;
  amount?: number;
  permanent?: boolean;
  expired_at?: Dayjs | null;
  source_preset?: string;
  source_custom?: string;
  remark?: string;
};

export interface GrantComplimentaryQuotaDrawerProps {
  open: boolean;
  editing: ComplimentaryQuota | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function GrantComplimentaryQuotaDrawer({
  open,
  editing,
  onClose,
  onSuccess,
}: GrantComplimentaryQuotaDrawerProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const currencySymbol = getCurrencySymbol();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const debouncedUserSearchKeyword = useDebouncedValue(userSearchKeyword, 300);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [userSelectOptions, setUserSelectOptions] = useState<UserSearchOption[]>([]);
  const [selectedUserOption, setSelectedUserOption] = useState<UserSearchOption | null>(null);
  const isEdit = editing != null;
  const sourcePreset = Form.useWatch('source_preset', form);
  const permanent = Form.useWatch('permanent', form);
  const watchedUserId = Form.useWatch('user_id', form);

  const fetchUserSelectOptions = useCallback(async (keyword: string) => {
    setUserSearchLoading(true);
    try {
      const res = await searchUsers({ keyword, p: 1, page_size: 50 });
      if (res.data.success) {
        setUserSelectOptions(parseSearchUserItems(res.data.data).map(toUserSearchOption));
      } else {
        setUserSelectOptions([]);
      }
    } catch {
      setUserSelectOptions([]);
    } finally {
      setUserSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setUserSearchKeyword('');
      setUserSelectOptions([]);
      setSelectedUserOption(null);
      return;
    }
    if (editing) {
      setSelectedUserOption({ label: `UID:${editing.user_id}`, value: editing.user_id });
      void searchUsers({ keyword: String(editing.user_id), p: 1, page_size: 50 }).then((res) => {
        if (!res.data.success) return;
        const hit = parseSearchUserItems(res.data.data).find((u) => u.id === editing.user_id);
        if (hit) setSelectedUserOption(toUserSearchOption(hit));
      }).catch(() => {});
      return;
    }
    void fetchUserSelectOptions(debouncedUserSearchKeyword);
  }, [open, editing, debouncedUserSearchKeyword, fetchUserSelectOptions]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const known = COMPLIMENTARY_SOURCE_PRESETS.some((p) => p.value === editing.source);
      const isPermanent = editing.expired_at == null || editing.expired_at <= 0;
      form.setFieldsValue({
        user_id: editing.user_id,
        amount: fromQuota(editing.amount, qpu),
        remark: editing.remark || '',
        permanent: isPermanent,
        expired_at: isPermanent ? null : dayjs.unix(editing.expired_at as number),
        source_preset: known ? editing.source : 'other',
        source_custom: known ? '' : editing.source || '',
      });
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      source_preset: 'campaign_gift',
      amount: 5,
      permanent: false,
      expired_at: dayjs().add(30, 'day'),
    });
  }, [open, editing, form, qpu]);

  const selectedUserLabel = useMemo(() => {
    const uid = isEdit ? editing?.user_id : watchedUserId;
    if (!uid) return '';
    if (selectedUserOption?.value === uid) return selectedUserOption.label;
    return `UID:${uid}`;
  }, [editing?.user_id, isEdit, selectedUserOption, watchedUserId]);

  const mergedUserSelectOptions = useMemo(() => {
    if (!selectedUserOption) return userSelectOptions;
    if (userSelectOptions.some((o) => o.value === selectedUserOption.value)) return userSelectOptions;
    return [selectedUserOption, ...userSelectOptions];
  }, [userSelectOptions, selectedUserOption]);

  const title = useMemo(() => {
    const base = isEdit
      ? `${t('edit')} ${t('complimentaryQuota.giftCredit')}`
      : `${t('complimentaryQuota.grant')} ${t('complimentaryQuota.giftCredit')}`;
    return selectedUserLabel ? `${base} — ${selectedUserLabel}` : base;
  }, [isEdit, selectedUserLabel, t]);

  const resolveSource = (fv: FormValues): string => {
    if (fv.source_preset === 'other') {
      return (fv.source_custom || '').trim() || 'manual';
    }
    return fv.source_preset || 'manual';
  };

  const resolveExpiredAt = (fv: FormValues): number | undefined => {
    if (fv.permanent) return undefined;
    if (fv.expired_at != null && dayjs.isDayjs(fv.expired_at) && fv.expired_at.isValid()) {
      return Math.floor(fv.expired_at.valueOf() / 1000);
    }
    return undefined;
  };

  const handleFinish = async (fv: FormValues) => {
    if (!fv.permanent) {
      const end = fv.expired_at;
      if (end == null || !dayjs.isDayjs(end) || !end.isValid()) {
        notifyApiError(t('fieldRequired'));
        return;
      }
      // 新建必须立即生效，失效时间需晚于当前；编辑允许保留原失效时间
      if (!isEdit && !end.isAfter(dayjs())) {
        notifyApiError(t('complimentaryQuota.endAfterStart'));
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEdit && editing) {
        const expiredAt = resolveExpiredAt(fv);
        const body: { remark?: string; expired_at?: number } = {
          remark: fv.remark ?? '',
        };
        if (expiredAt != null) body.expired_at = expiredAt;
        const res = await updateComplimentaryQuota(editing.id, body);
        if (res.data.success) {
          notifyApiSuccess(res.data.message || t('operationSuccess'));
          onClose();
          onSuccess();
        } else {
          notifyApiError(res.data.message);
        }
      } else {
        if (!fv.user_id || fv.amount == null || fv.amount <= 0) {
          notifyApiError(t('fieldRequired'));
          setSubmitting(false);
          return;
        }
        const expiredAt = resolveExpiredAt(fv);
        const res = await grantComplimentaryQuota({
          user_id: fv.user_id,
          amount: toQuota(fv.amount, qpu),
          source: resolveSource(fv),
          remark: fv.remark || '',
          ...(expiredAt != null ? { expired_at: expiredAt } : {}),
        });
        if (res.data.success) {
          notifyApiSuccess(t('complimentaryQuota.grantSuccessImmediate'));
          onClose();
          onSuccess();
        } else {
          notifyApiError(res.data.message);
        }
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setSubmitting(false);
  };

  return (
    <FormDrawer
      open={open}
      title={title}
      onClose={onClose}
      onSubmit={() => void form.submit()}
      loading={submitting}
      destroyOnClose
      submitText={t('save')}
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
          name="user_id"
          label={t('userName')}
          rules={isEdit ? undefined : [{ required: true, message: t('fieldRequired') }]}
        >
          <Select
            showSearch
            allowClear={!isEdit}
            disabled={isEdit}
            filterOption={false}
            loading={userSearchLoading}
            placeholder={t('gatewayTier.searchUser')}
            options={mergedUserSelectOptions}
            searchValue={isEdit ? undefined : userSearchKeyword}
            onSearch={isEdit ? undefined : setUserSearchKeyword}
            onChange={(_v, option) => {
              setSelectedUserOption((option as UserSearchOption | undefined) ?? null);
              setUserSearchKeyword('');
            }}
          />
        </Form.Item>

        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('complimentaryQuota.amountSetting')}
        </Typography.Text>
        <Form.Item
          name="amount"
          rules={[{ required: true, message: t('fieldRequired') }]}
        >
          <InputNumber
            style={numberInputStyle}
            min={0.0001}
            precision={QUOTA_PRECISION}
            step={QUOTA_STEP}
            disabled={isEdit}
            prefix={currencySymbol}
          />
        </Form.Item>

        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          {t('complimentaryQuota.usageRules')}
        </Typography.Text>
        <Form.Item name="permanent" valuePropName="checked" style={{ marginBottom: 12 }}>
          <Switch
            checkedChildren={t('gatewayTier.permanent')}
            unCheckedChildren={t('gatewayTier.limited')}
          />
        </Form.Item>
        {permanent ? (
          <Form.Item label={t('complimentaryQuota.endTime')}>
            <Space style={{ height: 32, color: 'var(--text-secondary)' }}>
              {t('noExpiration')}
            </Space>
          </Form.Item>
        ) : (
          <Form.Item
            name="expired_at"
            label={t('complimentaryQuota.endTime')}
            rules={[{ required: true, message: t('fieldRequired') }]}
          >
            <DatePicker
              showTime
              showNow={false}
              style={{ width: '100%' }}
              placeholder={t('complimentaryQuota.endTime')}
            />
          </Form.Item>
        )}

        <Form.Item
          name="source_preset"
          label={t('complimentaryQuota.reason')}
          rules={[{ required: true, message: t('fieldRequired') }]}
        >
          <Select
            disabled={isEdit}
            options={COMPLIMENTARY_SOURCE_PRESETS.map((p) => ({
              label: t(p.labelKey),
              value: p.value,
            }))}
          />
        </Form.Item>
        {sourcePreset === 'other' && !isEdit && (
          <Form.Item
            name="source_custom"
            label={t('complimentaryQuota.customReason')}
            rules={[{ required: true, message: t('fieldRequired') }]}
          >
            <Input allowClear />
          </Form.Item>
        )}

        <Form.Item name="remark" label={`${t('notes')} (${t('optional')})`}>
          <Input.TextArea rows={3} placeholder={t('complimentaryQuota.remarkPlaceholder')} />
        </Form.Item>
      </Form>
    </FormDrawer>
  );
}
