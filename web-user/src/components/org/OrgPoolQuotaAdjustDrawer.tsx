import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import { useTranslation } from 'react-i18next';
import API from '../../api';
import { fromQuota, toQuota } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { Organization } from '../../types';
import {
  computeAfterDisplay,
  QuotaAdjustFormBody,
  type QuotaAdjustFormValues,
  type QuotaAdjustMode,
} from '../quota/quota-adjust-shared';

export interface OrgPoolQuotaAdjustDrawerProps {
  open: boolean;
  org: Organization | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** 平台管理员：企业总池额度管理 */
export function OrgPoolQuotaAdjustDrawer({
  open,
  org,
  onClose,
  onSuccess,
}: OrgPoolQuotaAdjustDrawerProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [form] = Form.useForm<QuotaAdjustFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const beforeUnits = Number(org?.quota || 0);
  const beforeDisplay = fromQuota(beforeUnits, qpu);

  useEffect(() => {
    if (!open || !org) return;
    form.setFieldsValue({
      kind: 'add',
      amount: undefined,
      remark: '',
    });
  }, [open, org, form]);

  const title = org
    ? `${t('users.quotaAdjust.title')} — ${org.name}`
    : t('users.quotaAdjust.title');

  const handleFinish = async (values: QuotaAdjustFormValues) => {
    if (!org || submittingRef.current) return;

    const kind = values.kind ?? 'set';
    const numericAmount = Number(values.amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      notifyApiError(t('users.quotaAdjust.amountRequired'));
      return;
    }
    if (kind !== 'set' && numericAmount <= 0) {
      notifyApiError(t('users.quotaAdjust.amountMin'));
      return;
    }
    const remark = (values.remark ?? '').trim();

    const afterDisplay = computeAfterDisplay(beforeDisplay, kind, numericAmount);
    if (afterDisplay < 0) {
      notifyApiError(t('users.quotaAdjust.insufficientQuota'));
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        quota: toQuota(numericAmount, qpu),
        remark,
      };
      if (kind !== 'set') {
        payload.kind = kind;
      }

      const res = await API.put(`/api/lynx/orgs/${org.id}/quota`, payload);
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        onClose();
        onSuccess();
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

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
        initialValues={{ kind: 'add' as QuotaAdjustMode }}
        onFinish={(v) => void handleFinish(v)}
        className="quota-adjust-drawer__stack"
      >
        <QuotaAdjustFormBody beforeUnits={beforeUnits} qpu={qpu} t={t} />
      </Form>
    </FormDrawer>
  );
}
