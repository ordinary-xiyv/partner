import { notifyApiError, notifyApiSuccess } from '../lib/notifyApi';
import React, { useEffect, useMemo, useState } from 'react';
import { Spin } from 'antd';
import { useTranslation } from 'react-i18next';

import { AppPageHeader } from '../ui/appLayout';
import { copyToClipboard } from '../utils';
import { getMyOrg, getOrgBankReceiver, type OrgBankReceiver } from '../api';
import { useUser } from '../contexts/UserContext';
import TopUp from './TopUp';

function maskValue(value: string, head = 2, tail = 2) {
  if (!value) return '';
  if (value.length <= head + tail) return '*'.repeat(value.length);
  return `${value.slice(0, head)}${'*'.repeat(Math.max(4, value.length - head - tail))}${value.slice(-tail)}`;
}

function InfoRow({
  label,
  value,
  blurred,
  onCopy,
  copyText,
  compact,
}: {
  label: string;
  value: string;
  blurred: boolean;
  onCopy: () => void;
  copyText?: string;
  compact?: boolean;
}) {
  const iconBtnStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    background: 'var(--bg-card)',
    color: 'var(--text-secondary)',
    width: 28,
    height: 28,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: blurred ? 'not-allowed' : 'pointer',
    opacity: blurred ? 0.6 : 1,
    flexShrink: 0,
    padding: 0,
  };

  if (compact) {
    return (
      <div
        style={{
          display: 'grid',
          gap: 8,
          padding: '12px',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', filter: blurred ? 'blur(4px)' : 'none', wordBreak: 'break-word', flex: 1, minWidth: 0 }}>
            {value}
          </div>
          <button
            type="button"
            disabled={blurred}
            onClick={onCopy}
            style={iconBtnStyle}
            title={copyText}
            aria-label={copyText}
          >
            ⧉
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '132px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', filter: blurred ? 'blur(4px)' : 'none', minWidth: 0 }}>
        {value}
      </div>
      <button
        type="button"
        disabled={blurred}
        onClick={onCopy}
        style={iconBtnStyle}
        title={copyText}
        aria-label={copyText}
      >
        ⧉
      </button>
    </div>
  );
}

export default function OrgBankTransfer() {
  const { t } = useTranslation();
  const { userExt, isOrgBillingOwner } = useUser();
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [receiver, setReceiver] = useState<OrgBankReceiver | null>(null);
  const [orgOwnerEmail, setOrgOwnerEmail] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  const companyName = userExt?.company_name || t('orgBankTransfer.companyUnknown');
  const contactEmail = orgOwnerEmail || t('orgBankTransfer.emailUnknown');
  const copyMemo = useMemo(
    () => `${t('orgBankTransfer.memoCompanyPrefix')}${companyName}，${t('orgBankTransfer.memoEmailPrefix')}${contactEmail}`,
    [companyName, contactEmail, t],
  );

  useEffect(() => {
    (async () => {
      try {
        const [receiverRes, orgRes] = await Promise.all([getOrgBankReceiver(), getMyOrg()]);
        if (receiverRes.data?.success) {
          setReceiver(receiverRes.data.data || null);
        }
        if (orgRes.data?.success && orgRes.data.data?.email) {
          const em = String(orgRes.data.data.email).trim();
          if (em) setOrgOwnerEmail(em);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const safeReceiver: OrgBankReceiver = receiver || {
    accountName: '',
    taxNo: '',
    bankName: '',
    bankAccount: '',
    address: '',
    phone: '',
  };

  const copy = async (v: string) => {
    try {
      await copyToClipboard(v);
      notifyApiSuccess(t('copied'));
    } catch {
      notifyApiError(t('operationFailed'));
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin /></div>;
  }

  const hasReceiver = Boolean(receiver && (
    receiver.accountName || receiver.taxNo || receiver.bankName ||
    receiver.bankAccount || receiver.address || receiver.phone
  ));

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', paddingBottom: isMobile ? 16 : 0 }}>
      <AppPageHeader
        title={t('orgBankTransfer.enterpriseTitle')}
        subtitle={t('orgBankTransfer.enterpriseSubtitle') + t('orgBankTransfer.onlineTopupTitle') + t('orgBankTransfer.onlineTopupDesc')}
      />

      <div style={{ display: 'grid', gap: 14 }}>
        {isOrgBillingOwner && (
            <TopUp embedded onlineOnly enterpriseRecharge />
        )}

        <div style={{ padding: isMobile ? '14px 12px' : '16px 18px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, boxShadow: '0 8px 24px rgba(245,158,11,0.08)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
              ⚠ {t('orgBankTransfer.noticeTitle')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.9 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                1. {t('orgBankTransfer.notice1Prefix')}
                <span style={{ fontWeight: 700 }}>{copyMemo}</span>
                <button
                  type="button"
                  onClick={() => copy(copyMemo)}
                  style={{ fontSize: 12, border: '1px solid var(--border-default)', borderRadius: 8, padding: '3px 8px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {t('copy')}
                </button>
              </div>
              <div>2. {t('orgBankTransfer.notice2')}</div>
              <div>3. {t('orgBankTransfer.notice3')}</div>
              <div>4. {t('orgBankTransfer.notice4')}</div>
              <div>{t('orgBankTransfer.notice5')}</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                style={{ accentColor: 'var(--theme-color-primary)' }}
              />
              {t('orgBankTransfer.ack')}
            </label>
        </div>

        <div style={{ padding: isMobile ? '14px 12px' : '16px 18px', borderRadius: 14, border: '1px solid var(--border-default)', background: 'var(--bg-card)', boxShadow: '0 10px 28px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
            {t('orgBankTransfer.receiverTitle')}
          </div>
          {hasReceiver ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <InfoRow
                label={t('orgBankTransfer.accountName')}
                value={acknowledged ? safeReceiver.accountName : maskValue(safeReceiver.accountName, 2, 2)}
                blurred={!acknowledged}
                onCopy={() => copy(safeReceiver.accountName)}
                copyText={t('copy')}
                compact={isMobile}
              />
              <InfoRow
                label={t('orgBankTransfer.taxNo')}
                value={acknowledged ? safeReceiver.taxNo : maskValue(safeReceiver.taxNo, 3, 3)}
                blurred={!acknowledged}
                onCopy={() => copy(safeReceiver.taxNo)}
                copyText={t('copy')}
                compact={isMobile}
              />
              <InfoRow
                label={t('orgBankTransfer.bankName')}
                value={acknowledged ? safeReceiver.bankName : maskValue(safeReceiver.bankName, 2, 2)}
                blurred={!acknowledged}
                onCopy={() => copy(safeReceiver.bankName)}
                copyText={t('copy')}
                compact={isMobile}
              />
              <InfoRow
                label={t('orgBankTransfer.bankAccount')}
                value={acknowledged ? safeReceiver.bankAccount : maskValue(safeReceiver.bankAccount, 3, 3)}
                blurred={!acknowledged}
                onCopy={() => copy(safeReceiver.bankAccount)}
                copyText={t('copy')}
                compact={isMobile}
              />
              <InfoRow
                label={t('orgBankTransfer.address')}
                value={acknowledged ? safeReceiver.address : maskValue(safeReceiver.address, 3, 3)}
                blurred={!acknowledged}
                onCopy={() => copy(safeReceiver.address)}
                copyText={t('copy')}
                compact={isMobile}
              />
              <InfoRow
                label={t('orgBankTransfer.phone')}
                value={acknowledged ? safeReceiver.phone : maskValue(safeReceiver.phone, 2, 2)}
                blurred={!acknowledged}
                onCopy={() => copy(safeReceiver.phone)}
                copyText={t('copy')}
                compact={isMobile}
              />
            </div>
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              {t('orgBankTransfer.receiverEmpty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

