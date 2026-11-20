import { notify } from '../ui/notify';
import {notifyApiError, notifyApiSuccess, notifyApiErrorFromErr} from '../lib/notifyApi';
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Turnstile from 'react-turnstile';
import { Form, Input, Tag } from 'antd';
import type { TagProps } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { updateSelf, getLogsSelfStat, generateUserAccessToken, sendVerificationCode, bindEmailWithCode, sendBindPhoneCode, bindPhone, sendPhoneVerificationCode, getCaptcha, phoneResetPassword } from '../api';
import { useUser } from '../contexts/UserContext';
import { useStatus, useQuotaPerUnit } from '../contexts/StatusContext';
import { copyToClipboard, renderAmount, formatTime, getRoleName } from '../utils';
import { getUserDisplayQuota } from '../utils/quotaDisplay';
import { QuotaAmount } from '../components/QuotaAmount';
import { validatePasswordComplexity } from '../utils/passwordPolicy';
import { RoleAdminUser, RoleCommonUser, RoleFinance, RoleOperations, RoleRootUser, RoleSales } from '../utils/permission';
import './Profile.css';

const EMAIL_REG = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REG = /^1[3-9]\d{9}$/;
/** 解绑功能待后端就绪后再开放 */
const UNBIND_ACTION_ENABLED = false;

type AppTagColor = NonNullable<TagProps['color']>;
type ProfileVerifyStatus = 'bound' | 'unbound' | 'unset' | 'set';

const PROFILE_VERIFY_STATUS: Record<ProfileVerifyStatus, { color: AppTagColor; icon: React.ReactNode }> = {
  bound: { color: 'green', icon: <CheckCircleOutlined /> },
  set: { color: 'green', icon: <CheckCircleOutlined /> },
  unbound: { color: 'orange', icon: <ExclamationCircleOutlined /> },
  unset: { color: 'orange', icon: <ExclamationCircleOutlined /> },
};

const PROFILE_VERIFY_STATUS_LABEL_KEY: Record<ProfileVerifyStatus, string> = {
  bound: 'profile.statusBound',
  set: 'profile.statusSet',
  unbound: 'profile.statusUnbound',
  unset: 'profile.statusUnset',
};

function ProfileVerifyStatusTag({ kind }: { kind: ProfileVerifyStatus }) {
  const { t } = useTranslation();
  const { color, icon } = PROFILE_VERIFY_STATUS[kind];
  return (
    <Tag color={color} icon={icon} className="profile-verify-status-tag">
      {t(PROFILE_VERIFY_STATUS_LABEL_KEY[kind])}
    </Tag>
  );
}

const IconUser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6l-8-4z" />
  </svg>
);

const ROLE_BADGE_COLORS: Record<number, string> = {
  [RoleCommonUser]: 'var(--accent-blue)',
  [RoleFinance]: '#d97706',
  [RoleSales]: '#0891b2',
  [RoleOperations]: '#7c3aed',
  [RoleAdminUser]: '#f59e0b',
  [RoleRootUser]: '#ef4444',
};

function RoleBadge({ role }: { role: number }) {
  const { t } = useTranslation();
  const label = t(getRoleName(role));
  const color = ROLE_BADGE_COLORS[role] ?? 'var(--text-tertiary)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: color + '20', color,
      border: `1px solid ${color}40`,
    }}
    >
      {label}
    </span>
  );
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 11) return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  if (digits.length >= 7) return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
  return phone;
}

function avatarLetter(displayName: string, username: string): string {
  const src = (displayName || username || '?').trim();
  return src.charAt(0).toUpperCase();
}

function ProfileModal({
  open,
  title,
  desc,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  desc?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return createPortal(
    <div className="profile-modal-layer">
      <div className="profile-modal-backdrop" aria-hidden />
      <div className="profile-modal-layer__content">
        <div
          className="profile-modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="profile-modal__close"
            onClick={onClose}
            aria-label={t('cancel')}
          >
            &times;
          </button>
          <h2 className="profile-modal__title">{title}</h2>
          {desc ? <p className="profile-modal__desc">{desc}</p> : null}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 重置密码发码前的图形验证码弹窗：只能右上角 × 关闭（遮罩不可关），
 *  校验图形验证码后回调 onVerified 并把 captcha 一并交给发码逻辑 */
function PasswordResetCaptchaModal({
  open,
  phone,
  onClose,
  onVerified,
}: {
  open: boolean;
  phone: string;
  onClose: () => void;
  onVerified: (captcha: { captcha_id: string; captcha_val: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImg, setCaptchaImg] = useState('');
  const [val, setVal] = useState('');
  const [imgLoading, setImgLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setImgLoading(true);
    setVal('');
    try {
      const res = await getCaptcha();
      if (res.data?.success && res.data.data?.captcha_id) {
        setCaptchaId(res.data.data.captcha_id);
        setCaptchaImg(res.data.data.captcha_image);
      }
    } catch { /* ignore */ }
    finally { setImgLoading(false); }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleConfirm = useCallback(async () => {
    if (!val.trim()) {
      notifyApiError(t('graphicCaptchaRequired'));
      return;
    }
    if (!captchaId) {
      notifyApiError(t('graphicCaptchaLoading'));
      return;
    }
    setBusy(true);
    try {
      await onVerified({ captcha_id: captchaId, captcha_val: val.trim() });
    } finally {
      setBusy(false);
    }
  }, [val, captchaId, onVerified, t]);

  return (
    <ProfileModal
      open={open}
      title={t('sendCodeCaptchaTitle')}
      desc={t('auth.smsCodeCaptchaDesc')}
      onClose={onClose}
    >
      <p className="profile-captcha-phone">{maskPhone(phone)}</p>
      <div className="profile-field">
        <label className="profile-field__label">{t('graphicCaptchaPlaceholder')}</label>
        <div className="profile-captcha-row">
          <Input
            className="profile-modal-ant-input"
            style={{ flex: '1 1 160px', minWidth: 0 }}
            value={val}
            onChange={(e) => setVal(e.target.value.trim())}
            maxLength={8}
            autoComplete="off"
            placeholder={t('graphicCaptchaPlaceholder')}
          />
          <button
            type="button"
            className="profile-captcha-image"
            onClick={() => !imgLoading && refresh()}
            disabled={imgLoading}
            title={t('graphicCaptchaRefreshTitle')}
            aria-label={t('graphicCaptchaRefreshTitle')}
          >
            {captchaImg
              ? <img src={captchaImg} alt="" />
              : <span className="profile-captcha-loading">{t('graphicCaptchaLoadingShort')}</span>}
          </button>
        </div>
        <p className="profile-hint" style={{ marginTop: 6, marginBottom: 0 }}>{t('graphicCaptchaHint')}</p>
      </div>
      <button
        type="button"
        className="profile-btn-primary profile-modal__submit"
        disabled={busy || !val.trim()}
        onClick={() => void handleConfirm()}
      >
        {busy ? t('loading') : t('confirm')}
      </button>
    </ProfileModal>
  );
}

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qpu = useQuotaPerUnit();
  const { user, refresh, logout } = useUser();
  const { status: serverStatus } = useStatus();
  const [emailBindForm] = Form.useForm<{ email: string; code: string }>();
  const [phoneBindForm] = Form.useForm<{ phone: string; code: string }>();

  const [stat, setStat] = useState<{ quota: number; rpm: number; tpm: number } | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [accessTokenModalOpen, setAccessTokenModalOpen] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [generatingAccessToken, setGeneratingAccessToken] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwdCode, setPwdCode] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [emailBindCooldown, setEmailBindCooldown] = useState(0);
  const [emailBindSending, setEmailBindSending] = useState(false);
  const [emailBinding, setEmailBinding] = useState(false);
  const [phoneBindCooldown, setPhoneBindCooldown] = useState(0);
  const [phoneBindSending, setPhoneBindSending] = useState(false);
  const [phoneBindCaptchaModalOpen, setPhoneBindCaptchaModalOpen] = useState(false);
  const [phoneBindCaptchaPhone, setPhoneBindCaptchaPhone] = useState('');
  const [phoneBinding, setPhoneBinding] = useState(false);
  const [pwdSmsCooldown, setPwdSmsCooldown] = useState(0);
  const [pwdSmsSending, setPwdSmsSending] = useState(false);
  const [pwdCaptchaModalOpen, setPwdCaptchaModalOpen] = useState(false);

  const closePasswordModal = useCallback(() => {
    setPasswordModalOpen(false);
    setPwdCode('');
    setNewPwd('');
    setConfirmPwd('');
  }, []);

  const closePhoneModal = useCallback(() => {
    setPhoneModalOpen(false);
    phoneBindForm.resetFields();
  }, [phoneBindForm]);

  const closeEmailModal = useCallback(() => {
    setEmailModalOpen(false);
    emailBindForm.resetFields();
    setTurnstileToken('');
    setTurnstileResetKey((k) => k + 1);
  }, [emailBindForm]);

  const closeAccessTokenModal = useCallback(() => {
    if (generatingAccessToken) return;
    setAccessToken('');
    setAccessTokenModalOpen(false);
  }, [generatingAccessToken]);

  const handleGenerateAccessToken = useCallback(async () => {
    if (generatingAccessToken) return;
    setGeneratingAccessToken(true);
    try {
      const res = await generateUserAccessToken();
      const token = res.data?.data;
      if (res.data?.success && typeof token === 'string' && token) {
        setAccessToken(token);
      } else {
        notifyApiError(res.data?.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    } finally {
      setGeneratingAccessToken(false);
    }
  }, [generatingAccessToken, t]);

  const handleCopyAccessToken = useCallback(async () => {
    if (!accessToken) return;
    if (await copyToClipboard(accessToken)) {
      notifyApiSuccess(t('copied'));
    } else {
      notifyApiError(t('operationFailed'));
    }
  }, [accessToken, t]);

  useEffect(() => {
    if (user) setDisplayName(user.display_name || '');
  }, [user]);

  useEffect(() => {
    getLogsSelfStat().then((r) => {
      if (r.data?.data) setStat(r.data.data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (serverStatus?.turnstile_check && serverStatus.turnstile_site_key) {
      setTurnstileEnabled(true);
      setTurnstileSiteKey(String(serverStatus.turnstile_site_key));
    } else {
      setTurnstileEnabled(false);
      setTurnstileSiteKey('');
    }
  }, [serverStatus]);

  useEffect(() => {
    if (emailBindCooldown <= 0) return;
    const timer = window.setTimeout(() => setEmailBindCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [emailBindCooldown]);

  useEffect(() => {
    if (phoneBindCooldown <= 0) return;
    const timer = window.setTimeout(() => setPhoneBindCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phoneBindCooldown]);

  useEffect(() => {
    if (pwdSmsCooldown <= 0) return;
    const timer = window.setTimeout(() => setPwdSmsCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [pwdSmsCooldown]);

  useEffect(() => {
    if (!phoneModalOpen || !user) return;
    const raw = String(user.phone ?? '').replace(/\D/g, '');
    phoneBindForm.setFieldsValue({
      phone: PHONE_REG.test(raw) ? raw : '',
      code: '',
    });
  }, [phoneModalOpen, user, phoneBindForm]);

  const handleSaveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      const res = await updateSelf({ display_name: displayName });
      if (res.data.success) {
        notifyApiSuccess(t('operationSuccess'));
        refresh();
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setSavingProfile(false);
  }, [displayName, refresh, t]);

  const handleSendEmailBindCode = useCallback(async () => {
    let raw: string;
    try {
      const values = await emailBindForm.validateFields(['email']);
      raw = values.email.trim();
    } catch {
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      notify.info(t('turnstileWait'));
      return;
    }
    if (emailBindCooldown > 0 || emailBindSending) return;
    setEmailBindSending(true);
    try {
      const res = await sendVerificationCode(raw, turnstileToken || undefined);
      if (res.data.success) {
        notifyApiSuccess(t('emailBindCodeSent'));
        setEmailBindCooldown(60);
        setTurnstileToken('');
        setTurnstileResetKey((k) => k + 1);
      } else {
        notifyApiError((res.data as { message?: string }).message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setEmailBindSending(false);
  }, [emailBindForm, turnstileEnabled, turnstileToken, emailBindCooldown, emailBindSending, t]);

  const handleConfirmEmailBind = useCallback(async () => {
    let raw: string;
    let code: string;
    try {
      const values = await emailBindForm.validateFields(['email', 'code']);
      raw = values.email.trim();
      code = values.code.trim();
    } catch {
      return;
    }
    setEmailBinding(true);
    try {
      const res = await bindEmailWithCode(raw, code);
      if (res.data.success) {
        notifyApiSuccess(t('emailBindSuccess'));
        closeEmailModal();
        refresh();
      } else {
        notifyApiError((res.data as { message?: string }).message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setEmailBinding(false);
  }, [emailBindForm, refresh, t, closeEmailModal]);

  const handleSendPhoneBindCode = useCallback(async (raw: string, captcha?: { captcha_id: string; captcha_val: string }) => {
    if (!PHONE_REG.test(raw)) {
      notifyApiError(t('profile.phoneBindInvalidPhone'));
      return;
    }
    if (phoneBindCooldown > 0 || phoneBindSending) return;
    setPhoneBindSending(true);
    try {
      const res = await sendBindPhoneCode(raw, captcha);
      if (res.data.success) {
        notifyApiSuccess(t('profile.phoneBindCodeSent'));
        setPhoneBindCooldown(60);
      } else {
        notifyApiError((res.data as { message?: string }).message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setPhoneBindSending(false);
  }, [phoneBindCooldown, phoneBindSending, t]);

  const handleRequestPhoneBindCode = useCallback(async () => {
    let raw: string;
    try {
      const values = await phoneBindForm.validateFields(['phone']);
      raw = values.phone.replace(/\D/g, '').slice(0, 11);
    } catch {
      return;
    }
    if (!PHONE_REG.test(raw)) {
      notifyApiError(t('profile.phoneBindInvalidPhone'));
      return;
    }
    setPhoneBindCaptchaPhone(raw);
    setPhoneBindCaptchaModalOpen(true);
  }, [phoneBindForm, t]);

  const handlePhoneBindCaptchaVerified = useCallback(async (captcha: { captcha_id: string; captcha_val: string }) => {
    setPhoneBindCaptchaModalOpen(false);
    await handleSendPhoneBindCode(phoneBindCaptchaPhone, captcha);
  }, [handleSendPhoneBindCode, phoneBindCaptchaPhone]);

  const handleConfirmPhoneBind = useCallback(async () => {
    let raw: string;
    let code: string;
    try {
      const values = await phoneBindForm.validateFields(['phone', 'code']);
      raw = values.phone.replace(/\D/g, '').slice(0, 11);
      code = values.code.trim();
    } catch {
      return;
    }
    if (!PHONE_REG.test(raw)) {
      notifyApiError(t('profile.phoneBindInvalidPhone'));
      return;
    }
    setPhoneBinding(true);
    try {
      const res = await bindPhone({ phone: raw, code });
      if (res.data.success) {
        notifyApiSuccess(t('profile.phoneBindSuccess'));
        closePhoneModal();
        refresh();
      } else {
        notifyApiError((res.data as { message?: string }).message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setPhoneBinding(false);
  }, [phoneBindForm, refresh, t, closePhoneModal]);

  const handleOpenPasswordModal = useCallback(() => {
    if (!user?.phone) {
      notifyApiError(t('profile.bindPhoneFirst'));
      return;
    }
    setPasswordModalOpen(true);
  }, [user?.phone, t]);

  const handleSendPasswordSmsCode = useCallback(async (captcha?: { captcha_id: string; captcha_val: string }) => {
    const phone = String(user?.phone ?? '').replace(/\D/g, '');
    if (!PHONE_REG.test(phone)) {
      notifyApiError(t('profile.bindPhoneFirst'));
      return;
    }
    if (pwdSmsCooldown > 0 || pwdSmsSending) return;
    setPwdSmsSending(true);
    try {
      const res = await sendPhoneVerificationCode(phone, 'phone_reset_password', captcha);
      if (res.data.success) {
        notifyApiSuccess(t('profile.phoneBindCodeSent'));
        setPwdSmsCooldown(60);
      } else {
        notifyApiError((res.data as { message?: string }).message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setPwdSmsSending(false);
  }, [user?.phone, pwdSmsCooldown, pwdSmsSending, t]);

  const handleRequestPasswordSmsCode = useCallback(() => {
    setPwdCaptchaModalOpen(true);
  }, []);

  const handlePwdCaptchaVerified = useCallback(async (captcha: { captcha_id: string; captcha_val: string }) => {
    setPwdCaptchaModalOpen(false);
    await handleSendPasswordSmsCode(captcha);
  }, [handleSendPasswordSmsCode]);

  const handleChangePassword = useCallback(async () => {
    const phone = String(user?.phone ?? '').replace(/\D/g, '');
    if (!PHONE_REG.test(phone)) {
      notifyApiError(t('profile.bindPhoneFirst'));
      return;
    }
    if (!pwdCode.trim()) return notifyApiError(t('profile.phoneBindEnterCode'));
    if (!newPwd) return notifyApiError(t('passwordRequired'));
    const complexityError = validatePasswordComplexity(newPwd);
    if (complexityError) return notifyApiError(t(complexityError));
    if (newPwd !== confirmPwd) return notifyApiError(t('passwordMismatch'));
    setSavingPassword(true);
    try {
      const res = await phoneResetPassword({
        phone,
        code: pwdCode.trim(),
        new_password: newPwd,
      });
      if (res.data.success) {
        notifyApiSuccess(t('profile.passwordChangedLogout'));
        closePasswordModal();
        await logout();
        navigate('/login', { replace: true });
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
    setSavingPassword(false);
  }, [user?.phone, pwdCode, newPwd, confirmPwd, t, closePasswordModal, logout, navigate]);

  if (!user) return null;

  const displayQuota = getUserDisplayQuota(user);
  const quotaLimit = user.quota_display?.quota_limit;
  const totalForRatio = quotaLimit && quotaLimit > 0
    ? Number(quotaLimit)
    : displayQuota + user.used_quota;
  const usedRatio = totalForRatio > 0
    ? Math.round(user.used_quota / totalForRatio * 100)
    : 0;

  const phoneBound = Boolean(user.phone);
  const emailBound = Boolean(user.email);
  const wechatBound = Boolean(user.wechat_id);
  const registeredAt = user.created_at ? formatTime(user.created_at) : '—';
  const phoneDisplay = user.phone ? maskPhone(String(user.phone)) : t('profile.phoneNotBound');
  const boundPhoneRaw = String(user.phone ?? '').replace(/\D/g, '');

  return (
    <div className="profile-page">
      <div className="profile-page__header">
        <h2 className="profile-page__title">{t('profile')}</h2>
        <p className="profile-page__subtitle">{t('manageYourAccount')}</p>
      </div>

      {/* 顶部：账号身份 + 用量统计 */}
      <section className="profile-hero">
        <div className="profile-hero__top">
          <div className="profile-hero__avatar" aria-hidden>
            {avatarLetter(user.display_name, user.username)}
          </div>
          <div className="profile-hero__identity">
            <h3 className="profile-hero__display-name">
              {user.display_name || user.username}
            </h3>
            <p className="profile-hero__username">
              {t('userName')}
              ：
              {user.username}
            </p>
            <div className="profile-hero__meta">
              <span className="profile-hero__meta-item">
                {t('profile.accountId')}
                ：
                <strong>
                  #
                  {user.id}
                </strong>
              </span>
              <span className="profile-hero__meta-item">
                {t('profile.registeredAt')}
                ：
                <strong>
                  {registeredAt}
                </strong>
              </span>
              <span className="profile-hero__meta-item">
                <RoleBadge role={user.role} />
              </span>
            </div>
          </div>
        </div>

        <div className="profile-hero__stats">
          <div className="profile-hero__stat">
            <div className="profile-hero__stat-label">{t('remainingQuota')}</div>
            <div className="profile-hero__stat-value">
              <QuotaAmount quotaUnits={displayQuota} qpu={qpu} digits={4} showOverdraftLabel />
            </div>
            <div className="profile-hero__stat-sub">
              {t('used')}
              {' '}
              {usedRatio}
              %
            </div>
          </div>
          <div className="profile-hero__stat">
            <div className="profile-hero__stat-label">{t('requestCount')}</div>
            <div className="profile-hero__stat-value">{user.request_count?.toLocaleString() || '0'}</div>
            {stat?.rpm ? (
              <div className="profile-hero__stat-sub">
                {stat.rpm}
                {' '}
                req/min
              </div>
            ) : null}
          </div>
          <div className="profile-hero__stat">
            <div className="profile-hero__stat-label">{t('usedQuota')}</div>
            <div className="profile-hero__stat-value">{renderAmount(user.used_quota, 4, qpu)}</div>
            {stat?.tpm ? (
              <div className="profile-hero__stat-sub">
                {stat.tpm}
                {' '}
                tokens/min
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="profile-hero__quota-label">
            <span>{t('quotaUsage')}</span>
            <span>
              {renderAmount(user.used_quota, 4, qpu)}
              {' / '}
              {renderAmount(totalForRatio, 4, qpu)}
            </span>
          </div>
          <div className="profile-hero__quota-bar">
            <div
              className="profile-hero__quota-fill"
              style={{
                width: `${Math.min(usedRatio, 100)}%`,
                background: usedRatio > 80 ? '#ef4444' : usedRatio > 60 ? '#f59e0b' : 'var(--accent-primary)',
              }}
            />
          </div>
        </div>
      </section>

      <div className="profile-grid">
        <section id="profile-basic">
          <div className="profile-card">
            <div className="profile-card__head">
              <span className="profile-card__head-icon"><IconUser /></span>
              {t('profileInfo')}
            </div>
            <div className="profile-card__body">
              <div className="profile-row">
                <span className="profile-row__label">{t('profile.systemUsername')}</span>
                <span className="profile-row__value">{user.username}</span>
              </div>
              <div className="profile-row">
                <span className="profile-row__label">{t('group')}</span>
                <span className="profile-row__value">{user.group || 'default'}</span>
              </div>
              <p className="profile-hint" style={{ marginTop: 12 }}>{t('profile.systemUsernameHint')}</p>
              <div className="profile-field profile-field--inline">
                <label className="profile-field__label" htmlFor="profile-display-name">{t('name')}</label>
                <input
                  id="profile-display-name"
                  className="profile-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('displayNamePlaceholder')}
                />
              </div>
              <button
                type="button"
                className="profile-btn-primary"
                disabled={savingProfile}
                onClick={handleSaveProfile}
              >
                {savingProfile ? t('saving') : t('save')}
              </button>
            </div>
          </div>
        </section>

        <section id="profile-security">
          <div className="profile-card">
            <div className="profile-card__head">
              <span className="profile-card__head-icon"><IconShield /></span>
              {t('profile.identityVerify')}
            </div>
            <div className="profile-card__body">
              <div className="profile-row">
                <div className="profile-row__main">
                  <div className="profile-row__title-line">
                    <span className="profile-row__title">{t('profile.passwordLogin')}</span>
                  </div>
                  <div className="profile-row__desc">{t('profile.passwordLoginDesc')}</div>
                </div>
                <button
                  type="button"
                  className="profile-action-btn"
                  onClick={handleOpenPasswordModal}
                >
                  {t('changePassword')}
                </button>
              </div>

              <div className="profile-row">
                <div className="profile-row__main">
                  <div className="profile-row__title-line">
                    <span className="profile-row__title">{t('profile.phoneBind')}</span>
                    <ProfileVerifyStatusTag kind={phoneBound ? 'bound' : 'unbound'} />
                  </div>
                  <div className="profile-row__desc">{phoneDisplay}</div>
                </div>
                <button
                  type="button"
                  className="profile-action-btn"
                  onClick={() => setPhoneModalOpen(true)}
                >
                  {phoneBound ? t('profile.modify') : t('profile.bind')}
                </button>
              </div>

              <div className="profile-row">
                <div className="profile-row__main">
                  <div className="profile-row__title-line">
                    <span className="profile-row__title">{t('profile.emailBind')}</span>
                    <ProfileVerifyStatusTag kind={emailBound ? 'bound' : 'unbound'} />
                  </div>
                  <div className="profile-row__desc">
                    {emailBound ? user.email : t('emailNotBound')}
                  </div>
                </div>
                <button
                  type="button"
                  className="profile-action-btn"
                  disabled={emailBound && !UNBIND_ACTION_ENABLED}
                  aria-disabled={emailBound && !UNBIND_ACTION_ENABLED}
                  onClick={emailBound ? undefined : () => setEmailModalOpen(true)}
                >
                  {emailBound ? t('profile.unbind') : t('profile.bind')}
                </button>
              </div>

              {wechatBound && (
                <div className="profile-row">
                  <div className="profile-row__main">
                    <div className="profile-row__title-line">
                      <span className="profile-row__title">{t('wechatLogin')}</span>
                      <ProfileVerifyStatusTag kind="bound" />
                    </div>
                    <div className="profile-row__desc">{t('profile.wechatBoundDesc')}</div>
                  </div>
                </div>
              )}

              <div className="profile-row">
                <div className="profile-row__main">
                  <div className="profile-row__title-line">
                    <span className="profile-row__title">{t('profile.accessToken')}</span>
                  </div>
                  <div className="profile-row__desc">{t('profile.accessTokenDesc')}</div>
                </div>
                <button
                  type="button"
                  className="profile-action-btn"
                  onClick={() => setAccessTokenModalOpen(true)}
                >
                  {t('profile.accessTokenGenerate')}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ProfileModal
        open={accessTokenModalOpen}
        title={t('profile.accessToken')}
        desc={accessToken ? t('profile.accessTokenReady') : t('profile.accessTokenConfirm')}
        onClose={closeAccessTokenModal}
      >
        {accessToken ? (
          <>
            <div className="profile-field">
              <label className="profile-field__label" htmlFor="profile-access-token">{t('profile.accessToken')}</label>
              <Input.Password
                id="profile-access-token"
                className="profile-modal-ant-input"
                value={accessToken}
                readOnly
              />
            </div>
            <button type="button" className="profile-btn-primary profile-modal__submit" onClick={() => void handleCopyAccessToken()}>
              {t('copy')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="profile-btn-primary profile-modal__submit"
            disabled={generatingAccessToken}
            onClick={() => void handleGenerateAccessToken()}
          >
            {generatingAccessToken ? t('loading') : t('profile.accessTokenGenerate')}
          </button>
        )}
      </ProfileModal>

      <ProfileModal
        open={passwordModalOpen}
        title={t('changePassword')}
        desc={t('profile.passwordSmsHint')}
        onClose={closePasswordModal}
      >
        <div className="profile-field">
          <label className="profile-field__label">{t('profile.passwordSmsPhoneLabel')}</label>
          <Input
            className="profile-modal-ant-input"
            value={phoneBound ? maskPhone(boundPhoneRaw) : ''}
            disabled
          />
        </div>
        <div className="profile-field">
          <label className="profile-field__label">{t('profile.passwordSmsCodeLabel')}</label>
          <div className="profile-inline-actions">
            <Input
              className="profile-modal-ant-input"
              style={{ flex: '1 1 180px', minWidth: 0 }}
              value={pwdCode}
              onChange={(e) => setPwdCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t('profile.phoneBindEnterCode')}
            />
            <button
              type="button"
              className="profile-action-btn"
              disabled={pwdSmsSending || pwdSmsCooldown > 0}
              onClick={() => void handleRequestPasswordSmsCode()}
            >
              {pwdSmsCooldown > 0
                ? t('profile.passwordSmsResend', { seconds: pwdSmsCooldown })
                : t('profile.passwordSmsSendCode')}
            </button>
          </div>
        </div>
        <div className="profile-field">
          <label className="profile-field__label">{t('newPassword')}</label>
          <Input.Password
            className="profile-modal-ant-input"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder={t('newPasswordPlaceholder')}
            autoComplete="new-password"
          />
        </div>
        <div className="profile-field">
          <label className="profile-field__label">{t('confirmPassword')}</label>
          <Input.Password
            className="profile-modal-ant-input"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder={t('confirmPasswordPlaceholder')}
            autoComplete="new-password"
          />
        </div>
        <button
          type="button"
          className="profile-btn-primary profile-modal__submit"
          disabled={savingPassword || !pwdCode || !newPwd || newPwd !== confirmPwd}
          onClick={() => void handleChangePassword()}
        >
          {savingPassword ? t('saving') : t('changePassword')}
        </button>
      </ProfileModal>

      <PasswordResetCaptchaModal
        open={pwdCaptchaModalOpen}
        phone={boundPhoneRaw}
        onClose={() => setPwdCaptchaModalOpen(false)}
        onVerified={(captcha) => handlePwdCaptchaVerified(captcha)}
      />

      <ProfileModal
        open={phoneModalOpen}
        title={t('profile.phoneBindModalTitle')}
        desc={t('profile.phoneBindHint')}
        onClose={closePhoneModal}
      >
        <Form form={phoneBindForm} layout="vertical" requiredMark={false} className="profile-modal-form">
          <Form.Item label={t('profile.phoneBindNewLabel')} required>
            <div className="profile-inline-actions">
              <Form.Item
                name="phone"
                noStyle
                validateTrigger={['onChange', 'onBlur']}
                initialValue={phoneBound ? boundPhoneRaw : ''}
                rules={[
                  { required: true, whitespace: true, message: t('profile.phoneBindInvalidPhone') },
                  { pattern: PHONE_REG, message: t('profile.phoneBindInvalidPhone') },
                ]}
              >
                <Input
                  className="profile-modal-ant-input"
                  style={{ flex: '1 1 180px', minWidth: 0 }}
                  inputMode="numeric"
                  maxLength={11}
                  placeholder={t('auth.phoneRequired')}
                  autoComplete="tel"
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                    phoneBindForm.setFieldValue('phone', digits);
                  }}
                />
              </Form.Item>
              <button
                type="button"
                className="profile-action-btn"
                disabled={phoneBindSending || phoneBindCooldown > 0}
                onClick={() => void handleRequestPhoneBindCode()}
              >
                {phoneBindCooldown > 0
                  ? t('profile.phoneBindResend', { seconds: phoneBindCooldown })
                  : t('profile.phoneBindSendCode')}
              </button>
            </div>
          </Form.Item>
          <Form.Item
            label={t('profile.phoneBindCodeLabel')}
            name="code"
            validateTrigger={['onChange', 'onBlur']}
            rules={[{ required: true, whitespace: true, message: t('profile.phoneBindEnterCode') }]}
          >
            <Input
              className="profile-modal-ant-input"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder={t('profile.phoneBindEnterCode')}
            />
          </Form.Item>
        </Form>
        <button
          type="button"
          className="profile-btn-primary profile-modal__submit"
          disabled={phoneBinding}
          onClick={() => void handleConfirmPhoneBind()}
        >
          {phoneBinding ? t('saving') : t('profile.phoneBindConfirm')}
        </button>
      </ProfileModal>

      <PasswordResetCaptchaModal
        open={phoneBindCaptchaModalOpen}
        phone={phoneBindCaptchaPhone}
        onClose={() => setPhoneBindCaptchaModalOpen(false)}
        onVerified={(captcha) => handlePhoneBindCaptchaVerified(captcha)}
      />

      <ProfileModal
        open={emailModalOpen}
        title={t('profile.emailBindModalTitle')}
        desc={t('emailBindHint')}
        onClose={closeEmailModal}
      >
        <Form form={emailBindForm} layout="vertical" requiredMark={false} className="profile-modal-form">
          <Form.Item label={t('emailBindNewLabel')} required>
            <div className="profile-inline-actions">
              <Form.Item
                name="email"
                noStyle
                validateTrigger={['onChange', 'onBlur']}
                rules={[
                  { required: true, whitespace: true, message: t('emailRequired') },
                  { pattern: EMAIL_REG, message: t('emailBindInvalidEmail') },
                ]}
              >
                <Input
                  type="email"
                  className="profile-modal-ant-input"
                  style={{ flex: '1 1 180px', minWidth: 0 }}
                  placeholder={t('emailPlaceholder')}
                  autoComplete="email"
                />
              </Form.Item>
              <button
                type="button"
                className="profile-action-btn"
                disabled={emailBindSending || emailBindCooldown > 0}
                onClick={() => void handleSendEmailBindCode()}
              >
                {emailBindCooldown > 0
                  ? t('emailBindResend', { seconds: emailBindCooldown })
                  : t('emailBindSendCode')}
              </button>
            </div>
          </Form.Item>
          {turnstileEnabled && turnstileSiteKey ? (
            <div key={turnstileResetKey} className="profile-turnstile">
              <Turnstile
                sitekey={turnstileSiteKey}
                theme="light"
                onVerify={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken('')}
              />
            </div>
          ) : null}
          <Form.Item
            label={t('emailBindCodeLabel')}
            name="code"
            validateTrigger={['onChange', 'onBlur']}
            rules={[{ required: true, whitespace: true, message: t('emailBindEnterCode') }]}
          >
            <Input
              className="profile-modal-ant-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t('emailBindEnterCode')}
            />
          </Form.Item>
        </Form>
        <button
          type="button"
          className="profile-btn-primary profile-modal__submit"
          disabled={emailBinding}
          onClick={() => void handleConfirmEmailBind()}
        >
          {emailBinding ? t('saving') : t('emailBindConfirm')}
        </button>
      </ProfileModal>
    </div>
  );
}
