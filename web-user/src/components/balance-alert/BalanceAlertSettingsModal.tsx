import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Checkbox, InputNumber, Modal, Spin, Switch, Tag } from 'antd';
import { getMineBalanceAlert, saveMineBalanceAlert } from '../../api/balanceAlert';
import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../../lib/notifyApi';
import type { BalanceAlertMine } from '../../types/balanceAlert';
import styles from './BalanceAlertSettingsModal.module.css';

const THRESHOLD_MIN = 2;

const thresholdInputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 280,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum"',
};

export type BalanceAlertSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (enabled: boolean) => void;
};

function parseThresholdAmount(raw: string): number {
  const num = Number(raw);
  return Number.isFinite(num) ? num : THRESHOLD_MIN;
}

function validateThreshold(value: number | null): string | undefined {
  if (value == null || !Number.isFinite(value)) return 'balanceAlert.thresholdInvalid';
  if (value < THRESHOLD_MIN) return 'balanceAlert.thresholdMin';
  return undefined;
}

export default function BalanceAlertSettingsModal({
  open,
  onClose,
  onSaved,
}: BalanceAlertSettingsModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<BalanceAlertMine | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState<number | null>(THRESHOLD_MIN);
  // 短信渠道暂未开放
  // const [smsEnabled, setSmsEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);

  const applyMine = useCallback((data: BalanceAlertMine) => {
    setMine(data);
    setEnabled(data.enabled);
    setThreshold(parseThresholdAmount(data.threshold_amount || String(THRESHOLD_MIN)));
    // setSmsEnabled(Boolean(data.sms?.enabled && data.sms?.bound));
    setEmailEnabled(Boolean(data.email?.enabled && data.email?.bound));
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await getMineBalanceAlert();
      if (res.data.success && res.data.data) {
        applyMine(res.data.data);
      } else {
        setLoadError(true);
        notifyApiError(res.data.message, { fallbackKey: 'balanceAlert.loadFailed' });
      }
    } catch (err) {
      setLoadError(true);
      notifyApiErrorFromErr(err, { fallbackKey: 'balanceAlert.loadFailed' });
    } finally {
      setLoading(false);
    }
  }, [applyMine]);

  useEffect(() => {
    if (!open) return;
    void loadConfig();
  }, [open, loadConfig]);

  const goProfile = () => {
    onClose();
    navigate('/profile');
  };

  const handleSave = async () => {
    const thresholdErrorKey = validateThreshold(threshold);
    if (thresholdErrorKey) {
      notifyApiError(t(thresholdErrorKey));
      return;
    }
    // 短信渠道暂未开放：开启时仅校验邮件
    if (enabled && !emailEnabled) {
      notifyApiError(t('balanceAlert.channelRequired'));
      return;
    }
    // if (smsEnabled && mine && !mine.sms.bound) {
    //   notifyApiError(t('balanceAlert.smsUnboundHint'));
    //   return;
    // }
    if (emailEnabled && mine && !mine.email.bound) {
      notifyApiError(t('balanceAlert.emailUnboundHint'));
      return;
    }

    const amount = Number(threshold).toFixed(2);
    setSaving(true);
    try {
      const res = await saveMineBalanceAlert({
        enabled,
        threshold_amount: amount,
        sms_enabled: false, // 短信渠道暂未开放
        email_enabled: emailEnabled,
      });
      if (res.data.success && res.data.data) {
        notifyApiSuccess(
          t(res.data.data.enabled ? 'balanceAlert.enabledToast' : 'balanceAlert.saveSuccess'),
        );
        onSaved?.(res.data.data.enabled);
        onClose();
      } else {
        notifyApiError(res.data.message);
      }
    } catch (err) {
      notifyApiErrorFromErr(err);
    } finally {
      setSaving(false);
    }
  };

  const currencySymbol = mine?.currency_symbol || '¥';
  // const smsBound = Boolean(mine?.sms?.bound);
  const emailBound = Boolean(mine?.email?.bound);

  return (
    <Modal
      open={open}
      title={t('balanceAlert.settingsTitle')}
      onCancel={onClose}
      width={480}
      centered
      destroyOnClose
      className={styles.modal}
      footer={(
        <div className={styles.footer}>
          <Button onClick={onClose} disabled={saving}>{t('cancel')}</Button>
          <Button
            type="primary"
            loading={saving}
            disabled={loading || loadError}
            onClick={() => void handleSave()}
          >
            {t('save')}
          </Button>
        </div>
      )}
    >
      {loading ? (
        <div className={styles.loadingWrap}>
          <Spin />
        </div>
      ) : loadError ? (
        <div className={styles.errorWrap}>
          <p>{t('balanceAlert.loadFailed')}</p>
          <Button type="link" onClick={() => void loadConfig()}>{t('modelPlaza.retry')}</Button>
        </div>
      ) : (
        <div className={styles.form}>
          <div className={styles.row}>
            <span className={styles.label}>{t('balanceAlert.enabledLabel')}</span>
            <div className={styles.control}>
              <Switch checked={enabled} onChange={setEnabled} />
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>{t('balanceAlert.thresholdLabel')}</span>
            <div className={styles.control}>
              <InputNumber
                style={thresholdInputStyle}
                min={THRESHOLD_MIN}
                precision={2}
                step={0.01}
                prefix={currencySymbol}
                value={threshold}
                onChange={(v) => setThreshold(typeof v === 'number' ? v : null)}
              />
              <span className={styles.hint}>{t('balanceAlert.thresholdHint')}</span>
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>{t('balanceAlert.notifyMethod')}</span>
            <div className={`${styles.control} ${styles.channelChecks}`}>
              {/* 短信渠道暂未开放
              <Checkbox
                checked={smsEnabled}
                disabled={!smsBound}
                onChange={(e) => setSmsEnabled(e.target.checked)}
              >
                {t('balanceAlert.smsNotify')}
              </Checkbox>
              */}
              <Checkbox
                checked={emailEnabled}
                disabled={!emailBound}
                onChange={(e) => setEmailEnabled(e.target.checked)}
              >
                {t('balanceAlert.emailNotify')}
              </Checkbox>
            </div>
          </div>

          {/* 短信渠道暂未开放
          <div className={styles.row}>
            <span className={styles.label}>{t('balanceAlert.receivePhone')}</span>
            <div className={styles.control}>
              {smsBound ? (
                <div className={styles.contactValue}>{mine?.sms.display}</div>
              ) : (
                <div className={styles.unboundBlock}>
                  <Tag
                    color="orange"
                    icon={<ExclamationCircleOutlined />}
                    className={styles.unboundTag}
                  >
                    {t('profile.statusUnbound')}
                  </Tag>
                  <button type="button" className={styles.bindBtn} onClick={goProfile}>
                    {t('profile.bind')}
                  </button>
                </div>
              )}
            </div>
          </div>
          */}

          <div className={styles.row}>
            <span className={styles.label}>{t('balanceAlert.receiveEmail')}</span>
            <div className={styles.control}>
              {emailBound ? (
                <div className={styles.contactValue}>{mine?.email.display}</div>
              ) : (
                <div className={styles.unboundBlock}>
                  <Tag
                    color="orange"
                    icon={<ExclamationCircleOutlined />}
                    className={styles.unboundTag}
                  >
                    {t('profile.statusUnbound')}
                  </Tag>
                  <button type="button" className={styles.bindBtn} onClick={goProfile}>
                    {t('profile.bind')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
