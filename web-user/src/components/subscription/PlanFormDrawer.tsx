import {notifyApiError, notifyApiSuccess, notifyApiErrorFromErr} from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import { createPlan, updatePlan } from '../../api';
import { toQuota } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { Plan } from '../../types';

const QUOTA_PRECISION = 4;
const QUOTA_STEP = 0.01;

const numberInputStyle: React.CSSProperties = {
  width: '100%',
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

/** 套餐描述最大字数（与模型目录描述字段一致） */
const PLAN_DESCRIPTION_MAX_LEN = 50;

export type PlanFormValues = {
  name: string;
  description?: string;
  price?: number;
  quota?: number;
  duration?: number;
  sort?: number;
  status?: string;
  recommended?: boolean;
};

export interface PlanFormDrawerProps {
  open: boolean;
  record: Plan | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** 套餐新增 / 编辑抽屉（业务层，基于 FormDrawer） */
export function PlanFormDrawer({ open, record, onClose, onSuccess }: PlanFormDrawerProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [form] = Form.useForm<PlanFormValues>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (record) {
      form.setFieldsValue({
        name: record.name || '',
        description: (record.description || '').slice(0, PLAN_DESCRIPTION_MAX_LEN),
        price: record.price / 100,
        quota: record.quota / qpu,
        duration: record.duration,
        sort: record.sort ?? 0,
        status: String(record.status),
        recommended: record.recommended === true,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ sort: 0, status: '1', recommended: false });
    }
  }, [open, record, form, qpu]);

  const handleFinish = async (fv: PlanFormValues) => {
    setSubmitting(true);
    try {
      const values: Record<string, unknown> = {
        name: fv.name.trim(),
        description: fv.description,
        price: fv.price != null ? Math.round(fv.price * 100) : 0,
        quota: fv.quota != null ? toQuota(fv.quota, qpu) : 0,
        duration: fv.duration != null ? parseInt(String(fv.duration), 10) : 0,
        sort: fv.sort != null ? parseInt(String(fv.sort), 10) : 0,
        status: parseInt(String(fv.status ?? '1'), 10),
        recommended: fv.recommended === true,
      };
      const res = record
        ? await updatePlan(record.id, values)
        : await createPlan(values);
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

  const title = record ? `${t('edit')} ${record.name}` : t('create');

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
        <Form.Item name="name" label={t('planName')} rules={[{ required: true, whitespace: true, message: t('fieldRequired') }]}>
          <Input allowClear />
        </Form.Item>
        <Form.Item
          name="price"
          label={t('planPrice')}
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
          name="quota"
          label={t('planQuota')}
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
          name="duration"
          label={t('planDuration')}
          rules={[
            { required: true, message: t('fieldRequired') },
            { type: 'number', min: 1, message: t('fieldRequired') },
          ]}
        >
          <InputNumber style={{ width: '100%' }} min={1} precision={0} step={1} />
        </Form.Item>
        <Form.Item name="sort" label={t('planSort')}>
          <InputNumber style={{ width: '100%' }} min={0} precision={0} step={1} />
        </Form.Item>
        <Form.Item name="recommended" label={t('recommended')} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="status" label={t('planStatus')}>
          <Select
            options={[
              { label: t('onSale'), value: '1' },
              { label: t('offSale'), value: '2' },
            ]}
          />
        </Form.Item>
        <Form.Item name="description" label={t('planDescription')}>
          <Input.TextArea
            rows={3}
            autoSize={false}
            maxLength={PLAN_DESCRIPTION_MAX_LEN}
            showCount
            allowClear
            style={{ resize: 'none' }}
          />
        </Form.Item>
      </Form>
    </FormDrawer>
  );
}
