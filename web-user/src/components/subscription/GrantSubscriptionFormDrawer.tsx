import {notifyApiError, notifyApiSuccess, notifyApiErrorFromErr} from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { grantSubscription } from '../../api';
import { usePlanOptions, useUserOptions } from '../../hooks/useNameCache';
import { useCurrency } from '../../hooks/useCurrency';

const QUOTA_PRECISION = 4;
const QUOTA_STEP = 0.01;

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

export type GrantSubscriptionFormValues = {
  user_id?: number;
  plan_id?: number;
  order_no?: string;
  pay_amount?: number;
  pay_method?: string;
};

export interface GrantSubscriptionFormDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 手动发放订阅抽屉（业务层，基于 FormDrawer） */
export function GrantSubscriptionFormDrawer({ open, onClose, onSuccess }: GrantSubscriptionFormDrawerProps) {
  const { t } = useTranslation();
  const userOptions = useUserOptions();
  const planOptions = usePlanOptions();
  const cc = useCurrency();
  const [form] = Form.useForm<GrantSubscriptionFormValues>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
  }, [open, form]);

  const handleFinish = async (fv: GrantSubscriptionFormValues) => {
    if (!fv.user_id || !fv.plan_id) {
      notifyApiError(t('fieldRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const values: Record<string, unknown> = {
        user_id: fv.user_id,
        plan_id: fv.plan_id,
        order_no: fv.order_no || undefined,
        pay_amount: fv.pay_amount != null ? Math.round(fv.pay_amount * 100) : undefined,
        pay_method: fv.pay_method || undefined,
      };
      const res = await grantSubscription(values);
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        onClose();
        onSuccess();
      } else {
        notifyApiError(res.data.message);
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setSubmitting(false);
  };

  return (
    <FormDrawer
      open={open}
      title={t('grantSubscription')}
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
        <Form.Item name="user_id" label={t('userName')} rules={[{ required: true, message: t('fieldRequired') }]}>
          <Select
            showSearch
            allowClear
            placeholder={t('searchUserPlaceholder')}
            options={userOptions.map((o) => ({ label: o.label, value: o.value }))}
          />
        </Form.Item>
        <Form.Item name="plan_id" label={t('planName')} rules={[{ required: true, message: t('fieldRequired') }]}>
          <Select
            allowClear
            placeholder={t('selectPlan')}
            options={planOptions.map((o) => ({ label: o.label, value: o.value }))}
          />
        </Form.Item>
        <Form.Item name="order_no" label={t('orderNo')} rules={[{ required: true, message: t('fieldRequired') }]}>
          <Input allowClear variant="outlined" />
        </Form.Item>
        <Form.Item
          name="pay_amount"
          label={`${t('payAmount')} (${cc.symbol})`}
          rules={[{ required: true, message: t('fieldRequired') }]}
        >
          <InputNumber
            style={numberInputStyle}
            min={0}
            precision={QUOTA_PRECISION}
            step={QUOTA_STEP}
            variant="outlined"
          />
        </Form.Item>
        <Form.Item name="pay_method" label={t('payMethod')} rules={[{ required: true, message: t('fieldRequired') }]}>
          <Input allowClear variant="outlined" />
        </Form.Item>
      </Form>
    </FormDrawer>
  );
}
