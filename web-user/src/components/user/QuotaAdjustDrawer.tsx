import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import { useTranslation } from 'react-i18next';
import { updateUser } from '../../api';
import { fromQuota, toQuota } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { User } from '../../types';
import {
  computeAfterDisplay,
  QuotaAdjustFormBody,
  type QuotaAdjustFormValues,
  type QuotaAdjustMode,
} from '../quota/quota-adjust-shared';

export interface QuotaAdjustDrawerProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** 用户额度管理抽屉（与 UserFormDrawer 同层：FormDrawer + antd Form） */
export function QuotaAdjustDrawer({ open, user, onClose, onSuccess }: QuotaAdjustDrawerProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [form] = Form.useForm<QuotaAdjustFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const beforeUnits = user?.quota ?? 0;
  const beforeDisplay = fromQuota(beforeUnits, qpu);

  useEffect(() => {
    if (!open || !user) return;
    form.setFieldsValue({
      kind: 'add',
      amount: undefined,
      remark: '',
    });
  }, [open, user, form]);

  const title = user
    ? `${t('users.quotaAdjust.title')} — ${user.display_name || user.username}`
    : t('users.quotaAdjust.title');

  const handleFinish = async (values: QuotaAdjustFormValues) => {
    if (!user || submittingRef.current) return;

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
        id: user.id,
        username: user.username,
        quota: toQuota(numericAmount, qpu),
        quota_remark: remark,
      };
      if (kind !== 'set') {
        payload.kind = kind;
      }

      const res = await updateUser(payload);
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
