import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import { FormDrawer } from '../../ui/FormDrawer';
import React, { useEffect, useRef, useState } from 'react';
import { Form } from 'antd';
import { useTranslation } from 'react-i18next';
import API from '../../api';
import { fromQuota, renderAmount, toQuota } from '../../utils';
import { useQuotaPerUnit } from '../../contexts/StatusContext';
import type { Organization } from '../../types';
import {
  computeAfterDisplay,
  QuotaAdjustFormBody,
  type QuotaAdjustFormValues,
  type QuotaAdjustMode,
} from '../quota/quota-adjust-shared';

type OrgMemberWithUser = {
  user_id: number;
  username?: string;
  quota_limit?: number;
};

export interface OrgMemberQuotaAdjustDrawerProps {
  open: boolean;
  org: Organization | null;
  member: OrgMemberWithUser | null;
  maxQuotaUnits: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

/** 企业成员个人额度管理 */
export function OrgMemberQuotaAdjustDrawer({
  open,
  org,
  member,
  maxQuotaUnits,
  onClose,
  onSuccess,
}: OrgMemberQuotaAdjustDrawerProps) {
  const { t } = useTranslation();
  const qpu = useQuotaPerUnit();
  const [form] = Form.useForm<QuotaAdjustFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const beforeUnits = Number(member?.quota_limit || 0);
  const beforeDisplay = fromQuota(beforeUnits, qpu);

  useEffect(() => {
    if (!open || !member) return;
    form.setFieldsValue({
      kind: 'add',
      amount: undefined,
      remark: '',
    });
  }, [open, member, form]);

  const title = member
    ? `${t('users.quotaAdjust.title')} — ${member.username || `UID:${member.user_id}`}`
    : t('users.quotaAdjust.title');

  const handleFinish = async (values: QuotaAdjustFormValues) => {
    if (!org || !member || submittingRef.current) return;

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

    const finalUnits = toQuota(afterDisplay, qpu);
    if (maxQuotaUnits !== null && finalUnits > maxQuotaUnits) {
      notifyApiError(t('org.quotaExceedsRemaining', { max: renderAmount(maxQuotaUnits, 4, qpu) }));
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await API.put(`/api/lynx/org/mine/members/${member.user_id}/quota`, {
        quota_limit: finalUnits,
        remark,
      });
      if (res.data.success) {
        notifyApiSuccess(t('org.quotaUpdated'));
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
