import {notifyApiError, notifyApiSuccess, notifyApiErrorFromErr} from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Checkbox, Form, Input, InputNumber, Select, Switch, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { addToken, getSelectableGroups, getTokenKey, getTokens, updateToken } from '../../api';
import {
  buildGroupSelectOptions,
  formatChannelGroups,
  parseChannelGroups,
  type GroupSelectOption,
} from '../channel/channelGroup';
import { fromQuota, getCurrencySymbol, toQuota } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { AdminGroup, Token } from '../../types';

const MAX_CREDIT_LIMIT = 1_000_000_000;

const QUOTA_PRECISION = 4;
const QUOTA_STEP = 0.01;

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

const EXPIRATION_OPTIONS = [
  { labelKey: 'expireNever', value: -1 },
  { labelKey: 'expire1Day', value: 1 },
  { labelKey: 'expire7Days', value: 7 },
  { labelKey: 'expire30Days', value: 30 },
  { labelKey: 'expire90Days', value: 90 },
  { labelKey: 'expire180Days', value: 180 },
  { labelKey: 'expire365Days', value: 365 },
] as const;

const RESET_OPTIONS = [
  { labelKey: 'resetNever', value: '' },
  { labelKey: 'resetDaily', value: 'daily' },
  { labelKey: 'resetWeekly', value: 'weekly' },
  { labelKey: 'resetMonthly', value: 'monthly' },
] as const;

function computeExpiryDate(days: number): string {
  if (days <= 0) return '';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function computeExpiryTimestamp(days: number): number {
  if (days <= 0) return -1;
  return Math.floor(Date.now() / 1000) + days * 86400;
}

function resolveExpirationDays(token: Token): number {
  if (token.expired_time === -1) return -1;
  if (token.expired_time > 0) {
    const remainDays = Math.ceil((token.expired_time - Date.now() / 1000) / 86400);
    if (remainDays <= 0) return 30;
    const positiveOptions = EXPIRATION_OPTIONS.filter((o) => o.value > 0);
    return positiveOptions.reduce((prev, curr) =>
      Math.abs(curr.value - remainDays) < Math.abs(prev.value - remainDays) ? curr : prev,
    ).value;
  }
  return 30;
}

type TokenFormValues = {
  name: string;
  group: string;
  creditLimit?: number;
  unlimited: boolean;
  resetPeriod: string;
  expirationDays: number;
  isDefault: boolean;
  generateAKSK?: boolean;
};

export interface TokenFormDrawerProps {
  open: boolean;
  editingToken: Token | null;
  onClose: () => void;
  onSuccess: () => void;
  onCreated: (fullKey: string) => void;
  akskAvailable?: boolean;
  onAKSKCreated?: (accessKey: string, secretKey: string, tokenKey: string) => void;
}

export function TokenFormDrawer({
  open,
  editingToken,
  onClose,
  onSuccess,
  onCreated,
  akskAvailable = false,
  onAKSKCreated,
}: TokenFormDrawerProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [form] = Form.useForm<TokenFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupOptions, setGroupOptions] = useState<GroupSelectOption[]>([]);

  const fetchGroupOptions = useCallback(async (currentGroup?: string): Promise<GroupSelectOption[]> => {
    setGroupsLoading(true);
    let options: GroupSelectOption[] = [];
    try {
      // 用户可选分组，与后端令牌鉴权规则一致
      const res = await getSelectableGroups();
      if (res.data.success) {
        options = buildGroupSelectOptions(
          (res.data.data || []) as AdminGroup[],
          currentGroup ? [currentGroup] : undefined,
          { trustServerFilter: true }, // 服务端已过滤，保留 auto 等项
        );
        setGroupOptions(options);
      }
    } catch {
      /* ignore */
    }
    setGroupsLoading(false);
    return options;
  }, []);

  const unlimited = Form.useWatch('unlimited', form) ?? true;
  const expirationDays = Form.useWatch('expirationDays', form) ?? 30;

  const expiryPreview = useMemo(
    () => computeExpiryDate(expirationDays),
    [expirationDays],
  );

  const expirationSelectOptions = useMemo(
    () => EXPIRATION_OPTIONS.map((opt) => ({ label: t(opt.labelKey), value: opt.value })),
    [t],
  );

  const resetSelectOptions = useMemo(
    () => RESET_OPTIONS.map((opt) => ({ label: t(opt.labelKey), value: opt.value })),
    [t],
  );

  useEffect(() => {
    if (!open) return;
    if (editingToken) {
      const group = parseChannelGroups(editingToken.group)[0] ?? 'default';
      form.setFieldsValue({
        name: editingToken.name,
        group,
        unlimited: editingToken.unlimited_quota,
        creditLimit: editingToken.unlimited_quota
          ? undefined
          : fromQuota(editingToken.remain_quota, qpu),
        resetPeriod: '',
        expirationDays: resolveExpirationDays(editingToken),
        isDefault: editingToken.default ?? false,
      });
      void fetchGroupOptions(group);
    } else {
      form.resetFields();
      form.setFieldsValue({
        unlimited: true,
        resetPeriod: '',
        expirationDays: 30,
        isDefault: false,
        generateAKSK: false,
      });
      // 新建时令牌分组默认取白名单（服务端已按 lc_user_groups 过滤）的第一项，不再硬编码 default
      void fetchGroupOptions().then((options) => {
        const first = options.find((o) => o.value !== 'auto') ?? options[0];
        if (first) {
          form.setFieldValue('group', first.value);
        }
      });
    }
  }, [open, editingToken, form, qpu, fetchGroupOptions]);

  const handleFinish = async (fv: TokenFormValues) => {
    const name = fv.name.trim();
    if (!name) {
      notifyApiError(t('fieldRequired'));
      return;
    }
    if (!fv.unlimited) {
      const parsedLimit = Number(fv.creditLimit ?? 0);
      if (!Number.isFinite(parsedLimit) || parsedLimit < 0) {
        notifyApiError(t('operationFailed'));
        return;
      }
      if (parsedLimit > MAX_CREDIT_LIMIT) {
        notifyApiError(t('creditLimitTooLarge', { max: MAX_CREDIT_LIMIT }));
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        group: formatChannelGroups(fv.group ? [fv.group] : []),
        unlimited_quota: fv.unlimited,
        expired_time: computeExpiryTimestamp(fv.expirationDays),
        self_selectable: true,
        default: fv.isDefault,
      };
      if (!fv.unlimited && fv.creditLimit != null) {
        payload.remain_quota = toQuota(Number(fv.creditLimit), qpu);
      }
	  if (!editingToken && akskAvailable && fv.generateAKSK) payload.generate_aksk = true;

      if (editingToken) {
        payload.id = editingToken.id;
        const res = await updateToken(payload);
        if (res.data.success) {
          notifyApiSuccess(t('operationSuccess'));
          onClose();
          onSuccess();
        } else {
          notifyApiError(res.data.message);
        }
      } else {
        const res = await addToken(payload);
        if (res.data.success) {
          onClose();
          if (res.data.data?.access_key && res.data.data?.secret_key) {
            onAKSKCreated?.(res.data.data.access_key, res.data.data.secret_key, res.data.data.token_key);
          } else {
            const listRes = await getTokens({ p: 1, page_size: 1 });
            if (listRes.data.success) {
              const items = listRes.data.data?.items || [];
              if (items.length > 0) {
                const keyRes = await getTokenKey(items[0].id);
                if (keyRes.data.success) {
                  const rawKey = keyRes.data.data?.key || '';
                  const fullKey = rawKey.startsWith('sk-') ? rawKey : `sk-${rawKey}`;
                  onCreated(fullKey);
                }
              }
            }
          }
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

  const title = editingToken
    ? `${t('edit')} ${editingToken.name}`
    : t('createToken');

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
          label={t('tokenName')}
          rules={[{ required: true, whitespace: true, message: t('fieldRequired') }]}
        >
          <Input allowClear placeholder={t('tokenNamePlaceholder')} />
        </Form.Item>

        <Form.Item
          name="group"
          label={t('group')}
          rules={[{ required: true, message: t('fieldRequired') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('selectGroup')}
            loading={groupsLoading}
            options={groupOptions}
          />
        </Form.Item>

        <Form.Item label={t('creditLimit')}>
          <Form.Item name="unlimited" valuePropName="checked" noStyle>
            <Checkbox>{t('unlimited')}</Checkbox>
          </Form.Item>
          {!unlimited && (
            <Form.Item
              name="creditLimit"
              rules={[{ required: true, message: t('fieldRequired') }]}
              style={{ marginTop: 8, marginBottom: 0 }}
            >
              <InputNumber
                style={numberInputStyle}
                min={0}
                max={MAX_CREDIT_LIMIT}
                precision={QUOTA_PRECISION}
                step={QUOTA_STEP}
                prefix={getCurrencySymbol()}
                placeholder="0.00"
              />
            </Form.Item>
          )}
        </Form.Item>
          {/* 暂时隐藏，默认不重置 */}
        {/* <Form.Item name="resetPeriod" label={t('resetLimitEvery')}>
          <Select allowClear={false} options={resetSelectOptions} />
        </Form.Item> */}

        <Form.Item
          name="expirationDays"
          label={t('expiration')}
          extra={
            expiryPreview ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('keyWillExpireOn')}
                :
                {expiryPreview}
              </Typography.Text>
            ) : undefined
          }
        >
          <Select allowClear={false} options={expirationSelectOptions} />
        </Form.Item>

        <Form.Item
          name="isDefault"
          label={t('tokenDefaultUse')}
          valuePropName="checked"
          extra={t('tokenDefaultUseHint')}
        >
          <Switch />
        </Form.Item>
        {!editingToken && akskAvailable && <Form.Item name="generateAKSK" valuePropName="checked">
          <Checkbox>同时生成 AK/SK（凭据默认关闭，生成后可启用）</Checkbox>
        </Form.Item>}
      </Form>
    </FormDrawer>
  );
}
