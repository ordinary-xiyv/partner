import { notifyApiError, notifyApiErrorFromErr, notifyApiSuccess } from '../lib/notifyApi';
import { notify } from '../ui/notify';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { WechatOutlined } from '@ant-design/icons';
import { ConfigProvider, Input, theme as antdTheme } from 'antd';
import type { InputProps } from 'antd';
import { register as apiRegister, sendVerificationCode, sendPhoneVerificationCode, phoneLogin, phoneRegister, getCaptcha, verifyCaptchaChallenge, passwordLoginWithCaptcha, passwordLoginSmsSend, passwordLoginSmsVerify, requestPasswordResetEmail, resetPasswordWithToken } from '../api';
import API from '../api';
import { useUser } from '../contexts/UserContext';
import { useStatus } from '../contexts/StatusContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePostAuthNavigate } from '../hooks/usePostAuthNavigate';
import { getAvailableOAuthProviders } from '../constants/oauth';
import { getOAuthUrl } from '../utils/oauth';
import { resolveFooterLegalLabel } from '../utils/footerColumnsFromConfig';
import { useLocale } from '../i18n/hooks/useLocale';
import { validatePasswordComplexity } from '../utils/passwordPolicy';
import './AuthModal.css';
import AuthLoginMedia from './auth/AuthLoginMedia';
import type { AuthLoginMediaConfig } from './auth/AuthLoginMedia';
import {
  buildMediaCacheKey,
  readCachedLoginMedia,
  writeCachedLoginMedia,
  writeNoMediaSnapshot,
} from './auth/loginMediaRatioCache';

const REMEMBER_PHONE_KEY = 'lynx_auth_remember_phone';
const REMEMBER_USERNAME_KEY = 'lynx_auth_remember_username';
const PHONE_REG = /^1[3-9]\d{9}$/;
const EMAIL_REG = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 媒体面板在「配置已知但比例尚未测得、也没有缓存」时使用的设计稿默认比例（945/898） */
const MEDIA_RATIO_FALLBACK = 945 / 898;

type PhoneSmsPurpose = 'phone_login' | 'phone_register';

/** 发码时只请求一次；最终用途由服务端根据号码状态决定。图形验证码随请求一起提交，由后端校验。 */
async function sendPhoneSmsForLoginOrRegister(
  phone: string,
  captcha?: { captcha_id: string; captcha_val: string },
): Promise<PhoneSmsPurpose> {
  const response = await sendPhoneVerificationCode(phone, 'phone_login', captcha);
  if (!response.data.success) {
    throw new Error(response.data.message || '验证码发送失败');
  }

  const purpose = response.data.data?.purpose;
  if (purpose !== 'phone_login' && purpose !== 'phone_register') {
    throw new Error('服务端未返回有效的验证码用途');
  }
  return purpose;
}

/** antd 主题（登录弹层内 Input 等）：跟随站点深浅主题，避免暗底上出现深字/白底 */
export function buildAuthModalAntdTheme(resolvedTheme: 'light' | 'dark') {
  const isDark = resolvedTheme === 'dark';
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? '#8b74ff' : '#6d51ff',
      colorLink: isDark ? '#8b74ff' : '#6d51ff',
      colorText: isDark ? '#fafafa' : '#18181b',
      colorTextPlaceholder: isDark ? 'rgba(250, 250, 250, 0.35)' : 'rgba(0, 0, 0, 0.35)',
      colorBorder: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.12)',
      colorBgContainer: 'transparent',
      borderRadius: 10,
      fontSize: 14,
      controlHeight: 48,
    },
    components: {
      Input: {
        activeBorderColor: isDark ? '#8b74ff' : '#6d51ff',
        hoverBorderColor: isDark ? '#8b74ff' : '#6d51ff',
        activeShadow: '0 0 0 0 transparent',
      },
    },
  };
}

/** 兼容旧引用（设置页预览等）：默认亮色 */
export const AUTH_MODAL_ANTD_THEME = buildAuthModalAntdTheme('light');

interface AuthInputProps extends Omit<InputProps, 'onChange' | 'value' | 'variant'> {
  value: string;
  onChange: (value: string) => void;
  password?: boolean;
  /** 不包 auth-field 外层（验证码行等 flex 布局内使用） */
  bare?: boolean;
  /** 前置线性图标（48px 输入框视觉） */
  icon?: React.ReactNode;
}

/** 登录/注册统一 Ant Design 边框 Input */
function AuthInput({
  value,
  onChange,
  password = false,
  bare = false,
  icon,
  className,
  type,
  ...rest
}: AuthInputProps) {
  const inputClassName = ['auth-ant-input', className].filter(Boolean).join(' ');
  const common: InputProps = {
    ...rest,
    className: inputClassName,
    variant: 'outlined',
    value,
    onChange: (e) => onChange(e.target.value),
  };

  const inputEl = password
    ? <Input.Password {...common} />
    : <Input {...common} type={type} />;

  if (bare) {
    return (
      <div className="auth-ant-input-wrap">
        {icon && <span className="auth-field__icon">{icon}</span>}
        {inputEl}
      </div>
    );
  }

  return (
    <div className="auth-field auth-field--box">
      {icon && <span className="auth-field__icon">{icon}</span>}
      {inputEl}
    </div>
  );
}

interface AuthCodeInputGroupProps extends Omit<InputProps, 'onChange' | 'value' | 'variant'> {
  value: string;
  onChange: (value: string) => void;
  onSend?: () => void;
  sendLabel?: string;
  sendDisabled?: boolean;
  /** 为 false 时仅展示输入框（如已发码后锁定邮箱） */
  showSend?: boolean;
  className?: string;
  /** 前置线性图标 */
  icon?: React.ReactNode;
}

/** 输入框 + 右侧操作按钮：合并为单行输入组 */
function AuthCodeInputGroup({
  value,
  onChange,
  onSend,
  sendLabel,
  sendDisabled = false,
  showSend = true,
  className,
  icon,
  placeholder,
  ...rest
}: AuthCodeInputGroupProps) {
  const hasAction = showSend && sendLabel != null && onSend != null;

  return (
    <div
      className={[
        'auth-code-input-group',
        hasAction ? '' : 'auth-code-input-group--input-only',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <AuthInput bare icon={icon} value={value} onChange={onChange} placeholder={placeholder} {...rest} />
      {hasAction && (
        <button
          type="button"
          className="auth-code-input-group__btn"
          onClick={onSend}
          disabled={sendDisabled}
        >
          {sendLabel}
        </button>
      )}
    </div>
  );
}

interface AuthGraphicCaptchaGroupProps extends Omit<InputProps, 'onChange' | 'value' | 'variant'> {
  value: string;
  onChange: (value: string) => void;
  captchaImg: string | null;
  imgLoading?: boolean;
  onRefresh: () => void;
  hint: string;
  loadingText: string;
  refreshTitle: string;
  blockClassName?: string;
  className?: string;
  /** 输入框内按 Enter 触发确认（如邮箱验证弹窗） */
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  /** 前置线性图标 */
  icon?: React.ReactNode;
}

/** 图形验证码输入 + 图片：合并为单行输入组 */
function AuthGraphicCaptchaGroup({
  value,
  onChange,
  captchaImg,
  imgLoading = false,
  onRefresh,
  hint,
  loadingText,
  refreshTitle,
  blockClassName,
  className,
  placeholder,
  icon,
  onConfirm,
  confirmDisabled = false,
  onKeyDown,
  ...rest
}: AuthGraphicCaptchaGroupProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.key === 'Enter' && !e.defaultPrevented && onConfirm && !confirmDisabled) {
      e.preventDefault();
      onConfirm();
    }
  };

  return (
    <div className={['auth-captcha-block', blockClassName].filter(Boolean).join(' ')}>
      <div className={['auth-graphic-captcha-group', className].filter(Boolean).join(' ')}>
        <AuthInput
          bare
          icon={icon}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          {...rest}
        />
        <button
          type="button"
          className="auth-graphic-captcha-group__image"
          onClick={() => !imgLoading && onRefresh()}
          title={refreshTitle}
          disabled={imgLoading}
          aria-label={refreshTitle}
        >
          {captchaImg
            ? <img src={captchaImg} alt="" />
            : <span className="auth-graphic-captcha-group__loading">{loadingText}</span>}
        </button>
      </div>
      <div className="auth-graphic-captcha-group__hint-row">
        <p className="auth-graphic-captcha-group__hint">{hint}</p>
      </div>
    </div>
  );
}

/** 子弹窗 Portal：全屏统一蒙层突出弹窗，仅通过关闭按钮收起（点击蒙层不关闭） */
function AuthSubModalPortal({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme();
  return createPortal(
    <ConfigProvider theme={buildAuthModalAntdTheme(resolved)}>
      <div className="auth-submodal-layer">
        <div className="auth-submodal-backdrop" aria-hidden />
        <div className="auth-submodal-layer__content">{children}</div>
      </div>
    </ConfigProvider>,
    document.body,
  );
}

/* ───── 微信登录弹窗 ───── */
function WeChatLoginModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { login } = useUser();
  const { status } = useStatus();
  const navigatePostAuth = usePostAuthNavigate();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  const handleLogin = async () => {
    if (!code.trim()) {
      notifyApiError(t('auth.wechatCodeRequired'));
      return;
    }
    setLoading(true);
    try {
      const res = await API.get(`/api/oauth/wechat?code=${code.trim()}`);
      if (res.data.success) {
        login(res.data.data);
        notifyApiSuccess(t('auth.wechatLoginSuccess'));
        onClose();
        onSuccess();
        navigatePostAuth();
      } else {
        notifyApiError(res.data.message || t('auth.wechatCodeInvalid'));
      }
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'auth.loginFailed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: 16, padding: '32px 32px 28px',
        width: 320, boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }} onClick={(e) => e.stopPropagation()}>

        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>💬</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('auth.wechatLoginTitle')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.6 }}>
            {t('auth.wechatLoginDesc')}
          </div>
        </div>

        {/* 二维码 */}
        {status?.wechat_qrcode ? (
          <div style={{
            display: 'flex', justifyContent: 'center', marginBottom: 20,
          }}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: 12,
              border: '1px solid var(--border-default)',
              boxShadow: '0 2px 12px var(--border-default)',
            }}>
              <img src={status.wechat_qrcode} alt="WeChat QR Code" style={{ width: 160, height: 160, display: 'block' }} />
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            height: 184, marginBottom: 20,
            background: 'var(--bg-card)', borderRadius: 12,
            border: '1px solid var(--border-default)',
          }}>
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📵</div>
              <div style={{ fontSize: 13 }}>{t('auth.wechatQrNotConfigured')}</div>
            </div>
          </div>
        )}

        {/* 验证码输入 */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {t('auth.wechatCodeLabel')}
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onFocus={() => setCodeFocused(true)}
            onBlur={() => setCodeFocused(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLogin(); }}
            placeholder={t('auth.wechatCodePlaceholder')}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-card)',
              border: `1px solid ${codeFocused ? '#07c160' : 'var(--border-default)'}`,
              borderRadius: 8, color: 'var(--text-primary)',
              padding: '11px 14px', fontSize: 15, outline: 'none',
              textAlign: 'center', letterSpacing: '0.2em', fontWeight: 600,
              transition: 'border-color 0.15s',
            }}
          />
        </div>

        {/* 确认按钮 */}
        <button onClick={handleLogin} disabled={loading} style={{
          width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer',
          background: '#07c160', color: '#fff',
          fontSize: 15, fontWeight: 700, opacity: loading ? 0.7 : 1,
          transition: 'opacity 0.15s',
        }}>
          {loading ? t('auth.loggingIn') : t('auth.confirmLogin')}
        </button>

        {/* 关闭 */}
        <button onClick={onClose} style={{
          display: 'block', width: '100%', marginTop: 10,
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 13, color: 'var(--text-tertiary)', padding: '6px 0',
        }}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

/* ───── 忘记密码：内嵌图形验证 → 发邮箱验证码 → 重置密码 ───── */
function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [captchaPanelOpen, setCaptchaPanelOpen] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImg, setCaptchaImg] = useState('');
  const [captchaVal, setCaptchaVal] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    setCaptchaVal('');
    try {
      const res = await getCaptcha();
      if (res.data?.success && res.data.data?.captcha_id) {
        setCaptchaId(res.data.data.captcha_id);
        setCaptchaImg(res.data.data.captcha_image);
      } else {
        setCaptchaId('');
        setCaptchaImg('');
      }
    } catch {
      setCaptchaId('');
      setCaptchaImg('');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (captchaPanelOpen) loadCaptcha();
  }, [captchaPanelOpen, loadCaptcha]);

  const startCountdown = useCallback(() => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const axiosErrMsg = (err: unknown): string | undefined => {
    const d = (err as { response?: { data?: unknown } })?.response?.data;
    if (!d || typeof d !== 'object') return undefined;
    const o = d as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    const e = o.error;
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: string }).message === 'string') {
      return (e as { message: string }).message;
    }
    return undefined;
  };

  const openCaptchaPanel = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const trimmed = email.trim();
    if (!trimmed) {
      notifyApiError(t('emailRequired'));
      return;
    }
    if (!EMAIL_REG.test(trimmed)) {
      notifyApiError(t('auth.emailInvalid'));
      return;
    }
    if (countdown > 0) return;
    setCaptchaPanelOpen(true);
  };

  const backFromCaptchaPanel = () => {
    setCaptchaPanelOpen(false);
  };

  const confirmCaptchaAndSendEmail = async () => {
    if (!captchaVal.trim()) {
      notifyApiError(t('graphicCaptchaRequired'));
      return;
    }
    if (!captchaId) {
      notifyApiError(t('graphicCaptchaLoading'));
      return;
    }
    setSendingEmail(true);
    try {
      const res = await requestPasswordResetEmail(email.trim(), {
        captcha_id: captchaId,
        captcha_val: captchaVal.trim(),
      });
      if (res.data?.success) {
        notifyApiSuccess(t('verificationCodeSent'));
        setEmailSent(true);
        setCaptchaPanelOpen(false);
        startCountdown();
      } else {
        notifyApiError(res.data?.message || t('operationFailed'));
        loadCaptcha();
      }
    } catch (err: unknown) {
      notifyApiError(axiosErrMsg(err) || t('operationFailed'));
      loadCaptcha();
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      notifyApiError(t('emailRequired'));
      return;
    }
    if (!EMAIL_REG.test(trimmedEmail)) {
      notifyApiError(t('auth.emailInvalid'));
      return;
    }
    if (!verificationCode.trim()) {
      notifyApiError(t('verificationCodeRequired'));
      return;
    }
    if (!newPwd || newPwd.length < 8) {
      notifyApiError(t('passwordResetPasswordTooShort'));
      return;
    }
    const complexityError = validatePasswordComplexity(newPwd);
    if (complexityError) {
      notifyApiError(t(complexityError));
      return;
    }
    if (newPwd !== confirmPwd) {
      notifyApiError(t('passwordResetMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await resetPasswordWithToken({
        email: email.trim(),
        token: verificationCode.trim(),
        password: newPwd,
      });
      if (res.data.success) {
        notifyApiSuccess(t('passwordChanged'));
        onClose();
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
      }
    } catch (err: unknown) {
      notifyApiError(axiosErrMsg(err) || t('operationFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const emailLocked = captchaPanelOpen || emailSent;

  return (
    <AuthSubModalPortal>
      <div
        className="auth-forgot-modal auth-submodal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-forgot-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label={t('cancel')}>
          &times;
        </button>

        <h2 id="auth-forgot-title" className="auth-forgot-modal__title">
          {t('forgotPasswordModalTitle')}
        </h2>
        <p className="auth-forgot-modal__desc">{t('forgotPasswordDesc')}</p>

        <AuthCodeInputGroup
          type="email"
          className="auth-forgot-email-group"
          value={email}
          onChange={setEmail}
          disabled={emailLocked}
          name="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          showSend={!emailSent && !captchaPanelOpen}
          sendLabel={countdown > 0 ? `${countdown}s` : t('sendCode')}
          sendDisabled={countdown > 0}
          onSend={() => void openCaptchaPanel()}
        />

        {captchaPanelOpen && (
          <div className="auth-forgot-inset">
            <p className="auth-forgot-inset__desc">{t('forgotPasswordCaptchaDesc')}</p>
            <AuthGraphicCaptchaGroup
              blockClassName="auth-forgot-captcha-block"
              placeholder={t('graphicCaptchaPlaceholder')}
              value={captchaVal}
              onChange={setCaptchaVal}
              maxLength={8}
              autoFocus
              captchaImg={captchaImg}
              imgLoading={captchaLoading}
              onRefresh={loadCaptcha}
              hint={t('graphicCaptchaHint')}
              loadingText={t('graphicCaptchaLoadingShort')}
              refreshTitle={t('graphicCaptchaRefreshTitle')}
              onConfirm={() => void confirmCaptchaAndSendEmail()}
              confirmDisabled={sendingEmail}
            />
            <button
              type="button"
              className="auth-primary-btn auth-forgot-confirm-btn"
              onClick={() => void confirmCaptchaAndSendEmail()}
              disabled={sendingEmail}
            >
              {sendingEmail ? t('loading') : t('confirm')}
            </button>
            <button type="button" className="auth-forgot-back-btn" onClick={backFromCaptchaPanel}>
              {t('forgotPasswordCaptchaBack')}
            </button>
          </div>
        )}

        {emailSent && !captchaPanelOpen && (
          <>
            <AuthCodeInputGroup
              placeholder={t('auth.codeInputPlaceholder')}
              value={verificationCode}
              onChange={setVerificationCode}
              name="verification_code"
              autoComplete="one-time-code"
              sendLabel={countdown > 0 ? `${countdown}s` : t('sendCode')}
              sendDisabled={countdown > 0}
              onSend={() => void openCaptchaPanel()}
            />

            <form onSubmit={handleSubmit}>
              <AuthInput
                password
                placeholder={t('newPassword')}
                value={newPwd}
                onChange={setNewPwd}
                name="new-password"
                autoComplete="new-password"
              />
              <AuthInput
                password
                placeholder={t('confirmPassword')}
                value={confirmPwd}
                onChange={setConfirmPwd}
                name="new-password-confirm"
                autoComplete="new-password"
              />

              <button type="submit" disabled={submitting} className="auth-primary-btn auth-forgot-reset-btn">
                {submitting ? t('loading') : t('passwordResetSubmit')}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthSubModalPortal>
  );
}

/** 注册「发送邮箱验证码」前的图形验证弹窗 */
function RegisterCaptchaModal({
  open,
  email,
  onClose,
  afterSent,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
  afterSent: () => void;
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
      if (res.data.success) {
        setCaptchaId(res.data.data.captcha_id);
        setCaptchaImg(res.data.data.captcha_image);
      }
    } catch { /* ignore */ }
    finally { setImgLoading(false); }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleConfirm = async () => {
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
      const vr = await verifyCaptchaChallenge({ captcha_id: captchaId, captcha_val: val.trim() });
      if (!vr.data.success) {
        notifyApiError(vr.data.message || t('operationFailed'));
        refresh();
        return;
      }
      const sr = await sendVerificationCode(email);
      if (sr.data.success) {
        notifyApiSuccess(t('verificationCodeSent'));
        afterSent();
        onClose();
      } else {
        notifyApiError(sr.data.message || t('operationFailed'));
        refresh();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : undefined);
      notifyApiError(msg || t('operationFailed'));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AuthSubModalPortal>
      <div
        className="auth-forgot-modal auth-submodal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label={t('cancel')}>
          &times;
        </button>

        <h2 className="auth-forgot-modal__title">{t('sendCodeCaptchaTitle')}</h2>
        <p className="auth-forgot-modal__desc">{t('sendCodeCaptchaDesc')}</p>
        <p className="auth-submodal-email">{email}</p>

        <AuthGraphicCaptchaGroup
          blockClassName="auth-forgot-captcha-block"
          placeholder={t('graphicCaptchaPlaceholder')}
          value={val}
          onChange={setVal}
          maxLength={8}
          captchaImg={captchaImg}
          imgLoading={imgLoading}
          onRefresh={refresh}
          hint={t('graphicCaptchaHint')}
          loadingText={t('graphicCaptchaLoadingShort')}
          refreshTitle={t('graphicCaptchaRefreshTitle')}
          onConfirm={() => void handleConfirm()}
          confirmDisabled={busy}
        />

        <button type="button" className="auth-primary-btn auth-forgot-confirm-btn" onClick={handleConfirm} disabled={busy}>
          {busy ? t('loading') : t('confirm')}
        </button>
      </div>
    </AuthSubModalPortal>
  );
}

/* ───── Login Form ───── */
/** 手机号登录 — 发送短信验证码：先图形验证码校验通过，再调 send-code 发短信 */
function PhoneSmsSendModal({
  open,
  phone,
  onClose,
  afterSent,
}: {
  open: boolean;
  phone: string;
  onClose: () => void;
  afterSent: (purpose: PhoneSmsPurpose) => void;
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
      if (res.data.success) {
        setCaptchaId(res.data.data.captcha_id);
        setCaptchaImg(res.data.data.captcha_image);
      }
    } catch { /* ignore */ }
    finally { setImgLoading(false); }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleSend = async () => {
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
      const purpose = await sendPhoneSmsForLoginOrRegister(phone, {
        captcha_id: captchaId,
        captcha_val: val.trim(),
      });
      notifyApiSuccess(t('auth.smsCodeSent'));
      afterSent(purpose);
      onClose();
    } catch (err: unknown) {
      // 先取后端返回的 message（如「您的 IP 已被封禁，请联系管理员」）；
      // axios 抛出的错误本身是 Error 实例，若优先取 err.message 只会拿到
      // 「Request failed with status code 403」这类通用文案，后端原因被丢弃。
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : undefined);
      notifyApiError(msg || t('operationFailed'));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AuthSubModalPortal>
      <div
        className="auth-forgot-modal auth-submodal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label={t('cancel')}>
          &times;
        </button>

        <h2 className="auth-forgot-modal__title">{t('sendCodeCaptchaTitle')}</h2>
        <p className="auth-forgot-modal__desc">{t('auth.smsCodeCaptchaDesc')}</p>
        <p className="auth-submodal-email">{phone}</p>

        <AuthGraphicCaptchaGroup
          blockClassName="auth-forgot-captcha-block"
          placeholder={t('graphicCaptchaPlaceholder')}
          value={val}
          onChange={setVal}
          maxLength={8}
          captchaImg={captchaImg}
          imgLoading={imgLoading}
          onRefresh={refresh}
          hint={t('graphicCaptchaHint')}
          loadingText={t('graphicCaptchaLoadingShort')}
          refreshTitle={t('graphicCaptchaRefreshTitle')}
          onConfirm={() => void handleSend()}
          confirmDisabled={busy}
        />

        <button type="button" className="auth-primary-btn auth-forgot-confirm-btn" onClick={handleSend} disabled={busy}>
          {busy ? t('loading') : t('confirm')}
        </button>
      </div>
    </AuthSubModalPortal>
  );
}

/** 账号密码登录 — 图形验证码弹窗：验证码随登录请求一起提交（后端校验） */
function PasswordLoginCaptchaModal({
  open,
  account,
  password,
  rememberPassword,
  onClose,
  onSuccess,
}: {
  open: boolean;
  account: string;
  password: string;
  rememberPassword: boolean;
  onClose: () => void;
  /** 登录成功（返回后端 data），由父组件完成 login + 跳转 */
  onSuccess: (data: any) => void;
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
      if (res.data.success) {
        setCaptchaId(res.data.data.captcha_id);
        setCaptchaImg(res.data.data.captcha_image);
      }
    } catch { /* ignore */ }
    finally { setImgLoading(false); }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleConfirm = async () => {
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
      const res = await passwordLoginWithCaptcha({
        account: account.trim(),
        password,
        captcha_id: captchaId,
        captcha_val: val.trim(),
      });
      if (res.data.success) {
        onSuccess(res.data.data);
        onClose();
      } else {
        notifyApiError(res.data.message || t('operationFailed'));
        refresh();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : undefined);
      notifyApiError(msg || t('operationFailed'));
      refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AuthSubModalPortal>
      <div
        className="auth-forgot-modal auth-submodal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="auth-modal-close" onClick={onClose} aria-label={t('cancel')}>
          &times;
        </button>

        <h2 className="auth-forgot-modal__title">{t('sendCodeCaptchaTitle')}</h2>
        <p className="auth-forgot-modal__desc">{t('auth.passwordCaptchaDesc')}</p>
        <p className="auth-submodal-email">{account.trim()}</p>

        <AuthGraphicCaptchaGroup
          blockClassName="auth-forgot-captcha-block"
          placeholder={t('graphicCaptchaPlaceholder')}
          value={val}
          onChange={setVal}
          maxLength={8}
          captchaImg={captchaImg}
          imgLoading={imgLoading}
          onRefresh={refresh}
          hint={t('graphicCaptchaHint')}
          loadingText={t('graphicCaptchaLoadingShort')}
          refreshTitle={t('graphicCaptchaRefreshTitle')}
          onConfirm={() => void handleConfirm()}
          confirmDisabled={busy}
        />

        <button type="button" className="auth-primary-btn auth-forgot-confirm-btn" onClick={handleConfirm} disabled={busy}>
          {busy ? t('loading') : t('confirm')}
        </button>
      </div>
    </AuthSubModalPortal>
  );
}

/** 登录表单（登录页与「登录页设置」预览共用；预览中以 scale 缩小、inert 禁交互） */
export function LoginForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const navigatePostAuth = usePostAuthNavigate();
  const { login } = useUser();
  const { status } = useStatus();
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'password' | 'phone'>('phone');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [rememberPhone, setRememberPhone] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [phoneSendModalOpen, setPhoneSendModalOpen] = useState(false);
  const phoneSmsPurposeRef = useRef<PhoneSmsPurpose>('phone_login');
  const smsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [passwordCaptchaModalOpen, setPasswordCaptchaModalOpen] = useState(false);

  /** 用户短信双因子：密码+图形码通过后进入此步，展示获取/输入短信验证码 */
  const [sms2faPhoneMasked, setSms2faPhoneMasked] = useState('');
  const [userSms2faCode, setUserSms2faCode] = useState('');
  const [userSmsCountdown, setUserSmsCountdown] = useState(0);
  const userSmsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const submittingRef = useRef(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const isUserSms2faStep = Boolean(sms2faPhoneMasked);

  useEffect(() => {
    const savedPhone = localStorage.getItem(REMEMBER_PHONE_KEY);
    if (savedPhone) {
      setPhone(savedPhone);
      setRememberPhone(true);
    }
    const savedUsername = localStorage.getItem(REMEMBER_USERNAME_KEY);
    if (savedUsername) {
      setIdentifier(savedUsername);
      setRememberPassword(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (smsTimerRef.current) clearInterval(smsTimerRef.current);
      if (userSmsTimerRef.current) clearInterval(userSmsTimerRef.current);
    };
  }, []);

  const startSmsCountdown = useCallback(() => {
    setSmsCountdown(60);
    smsTimerRef.current = setInterval(() => {
      setSmsCountdown((prev) => {
        if (prev <= 1) {
          if (smsTimerRef.current) clearInterval(smsTimerRef.current);
          smsTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const startUserSmsCountdown = useCallback(() => {
    setUserSmsCountdown(60);
    if (userSmsTimerRef.current) clearInterval(userSmsTimerRef.current);
    userSmsTimerRef.current = setInterval(() => {
      setUserSmsCountdown((prev) => {
        if (prev <= 1) {
          if (userSmsTimerRef.current) clearInterval(userSmsTimerRef.current);
          userSmsTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const clearUserSms2faStep = useCallback(() => {
    setSms2faPhoneMasked('');
    setUserSms2faCode('');
    setUserSmsCountdown(0);
    if (userSmsTimerRef.current) {
      clearInterval(userSmsTimerRef.current);
      userSmsTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (loginMode !== 'password') clearUserSms2faStep();
  }, [loginMode, clearUserSms2faStep]);

  useEffect(() => {
    phoneSmsPurposeRef.current = 'phone_login';
    setSmsCode('');
  }, [phone]);

  const sendSmsCode = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      notifyApiError(t('auth.phoneRequired'), { toastId: 'phone-required' });
      return;
    }
    if (!PHONE_REG.test(trimmedPhone)) {
      notifyApiError(t('auth.phoneInvalid'), { toastId: 'phone-invalid' });
      return;
    }
    if (smsCountdown > 0) return;

    // 发短信前先弹图形验证码弹窗，校验通过后由 PhoneSmsSendModal 触发发码
    setPhoneSendModalOpen(true);
  };

  const sendUserSms2faCode = async () => {
    if (!isUserSms2faStep || userSmsCountdown > 0) return;
    try {
      const res = await passwordLoginSmsSend();
      if (res.data.success) {
        const masked = res.data.data?.phone_masked;
        if (typeof masked === 'string' && masked) {
          setSms2faPhoneMasked(masked);
        }
        notifyApiSuccess(t('auth.smsCodeSent'), { toastId: 'user-sms2fa-sent' });
        startUserSmsCountdown();
      } else {
        notifyApiError(res.data.message || t('operationFailed'), { toastId: 'user-sms2fa-send-error' });
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      notifyApiError(msg || t('operationFailed'), { toastId: 'user-sms2fa-send-error' });
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    if (isUserSms2faStep) {
      const trimmedCode = userSms2faCode.trim();
      if (!trimmedCode) {
        notifyApiError(t('auth.smsCodeRequired'), { toastId: 'user-sms2fa-required' });
        return;
      }
      submittingRef.current = true;
      setLoading(true);
      try {
        const res = await passwordLoginSmsVerify({ code: trimmedCode });
        if (res.data.success) {
          const trimmedUsername = identifier.trim();
          if (rememberPassword && trimmedUsername) {
            localStorage.setItem(REMEMBER_USERNAME_KEY, trimmedUsername);
          } else {
            localStorage.removeItem(REMEMBER_USERNAME_KEY);
          }
          clearUserSms2faStep();
          login(res.data.data);
          notifyApiSuccess(t('loginSuccess'), { toastId: 'login-success' });
          navigatePostAuth();
        } else {
          notifyApiError(res.data.message || t('operationFailed'), { toastId: 'user-sms2fa-error' });
        }
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
        notifyApiError(msg || t('operationFailed'), { toastId: 'user-sms2fa-error' });
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
      return;
    }

    submittingRef.current = true;

    if (!identifier.trim()) {
      notifyApiError(t('auth.usernameOrEmailRequired'), { toastId: 'login-account-required' });
      submittingRef.current = false;
      return;
    }
    if (!password) {
      notifyApiError(t('auth.passwordRequired'), { toastId: 'login-password-required' });
      submittingRef.current = false;
      return;
    }

    // 弹出图形验证码弹窗，校验通过后由 PasswordLoginCaptchaModal 完成登录
    submittingRef.current = false;
    setPasswordCaptchaModalOpen(true);
  };

  /** 验证码弹窗登录成功回调：处理 2fa 中间态或完成登录 */
  const handlePasswordCaptchaSuccess = (rawData: any) => {
    const data = rawData as {
      require_sms_2fa?: boolean | string;
      phone_masked?: string;
      id?: number;
    } | undefined;
    if (data?.require_sms_2fa === true || data?.require_sms_2fa === 'true') {
      setSms2faPhoneMasked(data.phone_masked || '****');
      setUserSms2faCode('');
      setUserSmsCountdown(0);
      return;
    }
    // 双因子中间态不应带完整用户 id；若无 id 也无 2fa 标记，视为异常
    if (data == null || data.id == null) {
      notifyApiError(t('operationFailed'), { toastId: 'login-error' });
      return;
    }
    const trimmedUsername = identifier.trim();
    if (rememberPassword && trimmedUsername) {
      localStorage.setItem(REMEMBER_USERNAME_KEY, trimmedUsername);
    } else {
      localStorage.removeItem(REMEMBER_USERNAME_KEY);
    }
    login(rawData);
    notifyApiSuccess(t('loginSuccess'), { toastId: 'login-success' });
    navigatePostAuth();
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const trimmedPhone = phone.trim();
    const trimmedCode = smsCode.trim();

    if (!trimmedPhone) {
      notifyApiError(t('auth.phoneRequired'), { toastId: 'phone-required' });
      return;
    }
    if (!PHONE_REG.test(trimmedPhone)) {
      notifyApiError(t('auth.phoneInvalid'), { toastId: 'phone-invalid' });
      return;
    }
    if (!trimmedCode) {
      notifyApiError(t('auth.smsCodeRequired'), { toastId: 'sms-required' });
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    const isRegisterFlow = phoneSmsPurposeRef.current === 'phone_register';
    try {
      const res = isRegisterFlow
        ? await phoneRegister({
          phone: trimmedPhone,
          code: trimmedCode,
          password: '',
        })
        : await phoneLogin({ phone: trimmedPhone, code: trimmedCode });
      if (res.data.success) {
        if (rememberPhone) {
          localStorage.setItem(REMEMBER_PHONE_KEY, trimmedPhone);
        } else {
          localStorage.removeItem(REMEMBER_PHONE_KEY);
        }
        login(res.data.data);
        notifyApiSuccess(
          isRegisterFlow ? t('loginSuccess') : t('loginSuccess'),
          { toastId: 'login-success' },
        );
        navigatePostAuth();
      } else {
        notifyApiError(res.data.message || t('operationFailed'), { toastId: 'phone-login-error' });
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : undefined);
      notifyApiError(msg || t('operationFailed'), { toastId: 'phone-login-error' });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const isPhoneMode = loginMode === 'phone';

  return (
    <>
    <div className="auth-login-card-body">
    <form className="auth-modal-form auth-modal-form--login" onSubmit={isPhoneMode ? handlePhoneSubmit : handlePasswordSubmit}>
      <div className="auth-login-mode-tabs">
        <button
          type="button"
          className={`auth-login-mode-tab${isPhoneMode ? ' is-active' : ''}`}
          onClick={() => setLoginMode('phone')}
        >
          {t('auth.phoneLoginTab')}
        </button>
        <span className="auth-login-mode-tab-divider" aria-hidden />
        <button
          type="button"
          className={`auth-login-mode-tab${!isPhoneMode ? ' is-active' : ''}`}
          onClick={() => setLoginMode('password')}
        >
          {t('auth.passwordLoginTab')}
        </button>
      </div>

      {isPhoneMode ? (
        <>
          <AuthInput
            type="tel"
            placeholder={t('auth.phoneRequired')}
            value={phone}
            onChange={setPhone}
            name="phone"
            autoComplete="tel"
            icon={<AuthIconPhone />}
          />
          <AuthCodeInputGroup
            placeholder={t('auth.codeInputPlaceholder')}
            value={smsCode}
            onChange={(v) => setSmsCode(v.replace(/\D/g, '').slice(0, 6))}
            name="sms_code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            sendLabel={smsCountdown > 0 ? `${smsCountdown}s` : t('auth.getSmsCode')}
            sendDisabled={smsCountdown > 0}
            onSend={sendSmsCode}
            icon={<AuthIconShield />}
          />

          <div className="auth-form-meta auth-form-meta--split">
            <label className="auth-remember-me">
              <input
                type="checkbox"
                checked={rememberPhone}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRememberPhone(checked);
                  if (!checked) localStorage.removeItem(REMEMBER_PHONE_KEY);
                }}
              />
              <span>{t('rememberMe')}</span>
            </label>
            <button
              type="button"
              className="auth-link-btn"
              onClick={() => notify.info(t('auth.noSmsCodeHint'))}
            >
              {t('auth.noSmsCode')}
            </button>
          </div>
        </>
      ) : (
        <>
          <AuthInput
            placeholder={t('auth.usernameOrEmailPlaceholder')}
            value={identifier}
            onChange={(v) => {
              if (isUserSms2faStep) return;
              setIdentifier(v);
            }}
            name="username"
            autoComplete="username"
            disabled={isUserSms2faStep}
            icon={<AuthIconUser />}
          />
          <AuthInput
            password
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(v) => {
              if (isUserSms2faStep) return;
              setPassword(v);
            }}
            name="password"
            autoComplete="current-password"
            disabled={isUserSms2faStep}
            icon={<AuthIconLock />}
          />

          {!isUserSms2faStep && (
            <div className="auth-form-meta auth-form-meta--split">
              <label className="auth-remember-me">
                <input
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRememberPassword(checked);
                    if (!checked) localStorage.removeItem(REMEMBER_USERNAME_KEY);
                  }}
                />
                <span>{t('rememberMe')}</span>
              </label>
              <button type="button" className="auth-link-btn" onClick={() => setShowForgotModal(true)}>
                {t('forgotPassword')}
              </button>
            </div>
          )}

          {isUserSms2faStep && (
            <>
              <p className="auth-sms2fa-hint" style={{
                margin: '0 0 12px',
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--text-secondary, #646a73)',
              }}>
                {t('auth.sms2faHint', { phone: sms2faPhoneMasked })}
              </p>
              <AuthCodeInputGroup
                placeholder={t('auth.smsCodePlaceholder')}
                value={userSms2faCode}
                onChange={(v) => setUserSms2faCode(v.replace(/\D/g, '').slice(0, 6))}
                name="user_sms_2fa_code"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                sendLabel={userSmsCountdown > 0 ? `${userSmsCountdown}s` : t('auth.getSmsCode')}
                sendDisabled={userSmsCountdown > 0 || loading}
                onSend={sendUserSms2faCode}
                icon={<AuthIconShield />}
              />
              <div className="auth-form-meta" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="auth-link-btn"
                  onClick={() => {
                    clearUserSms2faStep();
                  }}
                >
                  {t('auth.sms2faBack')}
                </button>
              </div>
            </>
          )}
        </>
      )}

      <button type="submit" disabled={loading} className="auth-primary-btn">
        {loading ? '...' : (isPhoneMode ? t('auth.phoneLoginSubmit') : t('login'))}
      </button>
    </form>
    </div>

    <AuthLoginCardFooter
      showRegisterLink={!isPhoneMode}
      onSwitchRegister={() => {
        const params = new URLSearchParams(location.search);
        params.set('tab', 'register');
        navigate({ pathname: '/login', search: params.toString() }, { state: location.state });
      }}
    />

    <PhoneSmsSendModal
      open={phoneSendModalOpen}
      phone={phone.trim()}
      onClose={() => setPhoneSendModalOpen(false)}
      afterSent={(purpose) => {
        phoneSmsPurposeRef.current = purpose;
        startSmsCountdown();
      }}
    />

    <PasswordLoginCaptchaModal
      open={passwordCaptchaModalOpen}
      account={identifier}
      password={password}
      rememberPassword={rememberPassword}
      onClose={() => setPasswordCaptchaModalOpen(false)}
      onSuccess={handlePasswordCaptchaSuccess}
    />

    {showForgotModal && (
      <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />
    )}
    </>
  );
}

/* ───── 登录卡片底部：其他登录方式 + 注册 ───── */
function AuthLoginCardFooter({
  onSwitchRegister,
  showRegisterLink,
}: {
  onSwitchRegister: () => void;
  showRegisterLink: boolean;
}) {
  const { t } = useTranslation();
  const { status } = useStatus();
  const navigatePostAuth = usePostAuthNavigate();
  const [showWeChatModal, setShowWeChatModal] = useState(false);

  const oauthProviders = getAvailableOAuthProviders(status);
  const wechatEnabled = status?.wechat_login ?? false;

  const handleWeChatClick = () => {
    if (wechatEnabled) {
      setShowWeChatModal(true);
      return;
    }
    notify.info(t('auth.wechatQrNotConfigured'));
  };

  const handleOAuth = async (providerKey: string) => {
    if (!status) return;
    try {
      const stateRes = await API.get('/api/oauth/state');
      if (!stateRes.data.success) {
        notifyApiError(stateRes.data.message || t('operationFailed'));
        return;
      }
      const state = stateRes.data.data;
      const url = getOAuthUrl(providerKey, status, state);
      if (url) window.open(url);
    } catch (err) {
      notifyApiErrorFromErr(err, { fallbackKey: 'operationFailed' });
    }
  };

  return (
    <>
      {/* 底部行始终渲染（仅注册链接按模式显隐）：保证手机/密码两种模式卡片等高，
          切换 tab 时整张卡片垂直居中位置不跳动（曾因手机模式整行不渲染、卡片矮 56px） */}
      <div className="auth-login-card-footer">
        <div className="auth-login-card-footer-left">
          {/* <span className="auth-modal-oauth-label">{t('auth.otherLoginMethods')}</span>
          <div className="auth-modal-oauth-icons">
            <button
              type="button"
              className="auth-modal-oauth-icon-btn auth-modal-oauth-icon-btn--wechat"
              title={t('wechatLogin')}
              aria-label={t('wechatLogin')}
              onClick={handleWeChatClick}
            >
              <WechatOutlined style={{ fontSize: 16 }} />
            </button>
            {oauthProviders.map((provider) => (
              <button
                key={provider.key}
                type="button"
                className="auth-modal-oauth-icon-btn auth-modal-oauth-icon-btn--provider"
                style={{ background: provider.color }}
                title={provider.label}
                aria-label={provider.label}
                onClick={() => handleOAuth(provider.key)}
              >
                {provider.label.slice(0, 1)}
              </button>
            ))}
          </div> */}
        </div>

        {/* 注册行恒渲染（手机模式 visibility 隐藏占位），保证两 tab 卡片等高不跳动 */}
        <div
          className={[
            'auth-footer-link',
            'auth-footer-link--inline',
            showRegisterLink ? '' : 'auth-footer-link--invisible',
          ].filter(Boolean).join(' ')}
        >
          <span>{t('auth.noAccountLabel')}</span>
          <a className="auth-footer-link-action" onClick={onSwitchRegister}>
            {t('auth.registerNow')}
          </a>
        </div>
      </div>

      {showWeChatModal && (
        <WeChatLoginModal
          onClose={() => setShowWeChatModal(false)}
          onSuccess={navigatePostAuth}
        />
      )}
    </>
  );
}

/* ───── Register Form ───── */
function RegisterForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useStatus();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [captchaModalOpen, setCaptchaModalOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef = useRef(false);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const emailVerificationEnabled = status?.email_verification ?? false;

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(60);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const openSendCodeCaptcha = () => {
    if (!email.trim()) {
      notifyApiError(t('emailRequired'), { toastId: 'reg-email-required' });
      return;
    }
    if (countdown > 0) return;
    setCaptchaModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    // 前置校验
    if (!username.trim()) { notifyApiError(t('usernameRequired'), { toastId: 'reg-error' }); return; }
    if (username.length > 15) { notifyApiError('用户名长度不能超过15个字符', { toastId: 'reg-error' }); return; }
    const complexityError = validatePasswordComplexity(password);
    if (complexityError) { notifyApiError(t(complexityError), { toastId: 'reg-error' }); return; }
    if (password !== password2) { notifyApiError(t('passwordMismatch'), { toastId: 'reg-error' }); return; }
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await apiRegister({ username, password, email: email || undefined, verification_code: verificationCode || undefined });
      if (res.data.success) {
        notifyApiSuccess(t('registerSuccess'), { toastId: 'reg-success' });
        navigate('/login', { state: location.state, replace: true });
      } else notifyApiError(res.data.message || t('operationFailed'), { toastId: 'reg-error' });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : undefined);
      notifyApiError(msg || t('operationFailed'), { toastId: 'reg-error' });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <form className="auth-modal-form auth-modal-form--register" onSubmit={handleSubmit}>
      <AuthInput placeholder={t('username')} value={username} onChange={setUsername} name="username" autoComplete="username" />
      <AuthInput
        type="email"
        placeholder={t('email')}
        value={email}
        onChange={setEmail}
        name="email"
        autoComplete="email"
      />
      {emailVerificationEnabled && (
        <AuthCodeInputGroup
          placeholder={t('auth.codeInputPlaceholder')}
          value={verificationCode}
          onChange={setVerificationCode}
          name="verification_code"
          autoComplete="one-time-code"
          sendLabel={countdown > 0 ? `${countdown}s` : t('sendCode')}
          sendDisabled={countdown > 0}
          onSend={openSendCodeCaptcha}
        />
      )}

      {emailVerificationEnabled && (
        <RegisterCaptchaModal
          open={captchaModalOpen}
          email={email.trim()}
          onClose={() => setCaptchaModalOpen(false)}
          afterSent={startCountdown}
        />
      )}

      <AuthInput password placeholder={t('password')} value={password} onChange={setPassword} name="new-password" autoComplete="new-password" />
      <AuthInput password placeholder={t('confirmPassword')} value={password2} onChange={setPassword2} name="new-password-confirm" autoComplete="new-password" />

      <button type="submit" disabled={loading} className="auth-primary-btn">
        {loading ? '...' : t('register')}
      </button>

      <div className="auth-footer-link">
        <span>{t('hasAccount')}</span>
        <a
          className="auth-footer-link-action"
          onClick={() => {
            const params = new URLSearchParams(location.search);
            params.delete('tab');
            navigate({ pathname: '/login', search: params.toString() }, { state: location.state });
          }}
        >
          {t('goLogin')}
        </a>
      </div>
    </form>
  );
}

/* ───── 登录/注册页（/login）— 灵通云参考实现复刻 ───── */

/** 品牌区/输入框线性图标（内联 SVG，色值随 currentColor） */
const AUTH_ICON_STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function AuthIconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" {...AUTH_ICON_STROKE} />
      <path d="M10.5 18.5h3" {...AUTH_ICON_STROKE} />
    </svg>
  );
}

function AuthIconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 3l7 4v5c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V7l7-4z" {...AUTH_ICON_STROKE} />
      <path d="M9 12l2 2 4-4" {...AUTH_ICON_STROKE} />
    </svg>
  );
}

function AuthIconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="3.5" {...AUTH_ICON_STROKE} />
      <path d="M5 20c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" {...AUTH_ICON_STROKE} />
    </svg>
  );
}

function AuthIconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" {...AUTH_ICON_STROKE} />
      <path d="M8 10V7.5a4 4 0 118 0V10" {...AUTH_ICON_STROKE} />
    </svg>
  );
}

/** 品牌区特性列表图标 */
function AuthBrandFeatureIcon({ kind }: { kind: 0 | 1 | 2 }) {
  if (kind === 0) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3l7 4v5c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V7l7-4z" stroke="#8B74FF" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="#8B74FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 1) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 17l5-6 4 3 7-8" stroke="#5B8DEF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 21h16" stroke="#5B8DEF" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="#8B74FF" strokeWidth="1.8" />
      <path d="M12 8v4l2.5 2.5" stroke="#8B74FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 左侧品牌区：纯 CSS 视觉（渐变底 + 光晕 + 网格 + 主副文案 + 特性；logo 行与页脚按用户要求移除） */
function AuthBrandPanel() {
  const { t } = useTranslation();

  return (
    <aside className="auth-modal-brand" aria-hidden="true">
      <div className="auth-brand-glow auth-brand-glow--1" />
      <div className="auth-brand-glow auth-brand-glow--2" />
      <div className="auth-brand-grid" />
      <div className="auth-brand-content">
        <h1 className="auth-brand-title">
          {t('auth.brandTitle')}
          <br />
          <span className="auth-brand-accent">{t('auth.brandTitleAccent')}</span>
        </h1>
        <p className="auth-brand-subtitle">{t('auth.brandSubtitle')}</p>
        <ul className="auth-brand-features">
          <li>
            <AuthBrandFeatureIcon kind={0} />
            {t('auth.brandFeature1')}
          </li>
          <li>
            <AuthBrandFeatureIcon kind={1} />
            {t('auth.brandFeature2')}
          </li>
          <li>
            <AuthBrandFeatureIcon kind={2} />
            {t('auth.brandFeature3')}
          </li>
        </ul>
      </div>
    </aside>
  );
}

export function AuthPage({ tab }: { tab: 'login' | 'register' }) {
  const { t } = useTranslation();
  const { siteAppearance, loading: appearanceLoading } = useStatus();
  const { locale } = useLocale();
  const { resolved: resolvedTheme } = useTheme();
  // 媒体原始宽高比（就绪后由 AuthLoginMedia 上报）；null = 尚未测得
  const [mediaRatio, setMediaRatio] = useState<number | null>(null);
  // 预加载的 video 元素（首帧已缓冲），就绪后直接复用为展示元素
  const probeVideoRef = useRef<HTMLVideoElement | null>(null);
  // 上次的媒体决策快照：服务端外观尚未就绪时先用它决定首帧形态，
  // 避免「已配置媒体」的站点每次刷新都先闪一下品牌兜底区。
  // hit=false 表示从没访问过（新浏览器/清缓存），此时不知有无媒体
  const cachedMediaResult = useMemo(() => readCachedLoginMedia(), []);
  const cachedMedia = cachedMediaResult.snapshot;

  // 登录页媒体配置来自站点外观（服务端已填充 URL）；未配置/未加载时 type='none'
  const loginMediaConfig: AuthLoginMediaConfig = siteAppearance?.login_media_config
    ? {
        type: siteAppearance.login_media_config.type,
        image_url: siteAppearance.login_media_config.image_url,
        video_url: siteAppearance.login_media_config.video_url,
        poster_url: siteAppearance.login_media_config.poster_url,
      }
    : { type: 'none' };

  // 版权行：读站点「页脚设置」配置（版权 labels/legacy），与全站页脚同源
  const copyrightText = useMemo(
    () => resolveFooterLegalLabel(
      siteAppearance?.copyright_labels,
      siteAppearance?.copyright_text,
      locale,
      `${new Date().getFullYear()} {{brandName}}`,
    ).replace('{{brandName}}', t('header.systemName')),
    [siteAppearance?.copyright_labels, siteAppearance?.copyright_text, locale, t],
  );

  const hasMedia = loginMediaConfig.type !== 'none';
  // 外观接口是否已返回（未返回时 type='none' 不代表「真的没配置」，只代表「还不知道」）
  const mediaConfigReady = !appearanceLoading;

  // 媒体标识：file_id 优先（刷新首帧只有 file_id，URL 要等接口返回才有），
  // 保证同一媒体在「接口返回前/后」算出同一个键，缓存才能命中
  const mediaKey = buildMediaCacheKey(
    loginMediaConfig.type,
    loginMediaConfig.type === 'video'
      ? siteAppearance?.login_media_config?.video_file_id
      : siteAppearance?.login_media_config?.image_file_id,
    loginMediaConfig.type === 'video'
      ? loginMediaConfig.video_url
      : loginMediaConfig.image_url,
  );
  // 缓存仅在标识一致时可用，避免换/删媒体后沿用旧比例
  const cachedRatio = cachedMedia.key && cachedMedia.key === mediaKey ? cachedMedia.ratio : 0;

  // 媒体变化（换图/换视频/清空）时重置比例，避免沿用旧媒体的 aspect-ratio
  useEffect(() => {
    setMediaRatio(null);
  }, [loginMediaConfig.type, loginMediaConfig.image_url, loginMediaConfig.video_url]);

  // 媒体元数据预加载：尽早拿到真实宽高比（图片解码 / 视频首帧）
  useEffect(() => {
    if (!hasMedia) return undefined;
    const url = (loginMediaConfig.type === 'video'
      ? loginMediaConfig.video_url
      : loginMediaConfig.image_url) || '';
    if (!url) return undefined;
    let cancelled = false;
    if (loginMediaConfig.type === 'image') {
      const probe = new Image();
      probe.onload = () => {
        if (!cancelled && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
          setMediaRatio(probe.naturalWidth / probe.naturalHeight);
        }
      };
      probe.src = url;
    } else {
      const probe = document.createElement('video');
      // preload='auto'：探测视频顺带缓冲首帧，切换后直接复用该元素（浏览器缓存/数据复用）
      probe.preload = 'auto';
      probe.muted = true;
      probe.loop = true;
      probe.playsInline = true;
      if (loginMediaConfig.poster_url) probe.poster = loginMediaConfig.poster_url;
      const onReady = () => {
        if (!cancelled && probe.videoWidth > 0 && probe.videoHeight > 0) {
          setMediaRatio(probe.videoWidth / probe.videoHeight);
        }
      };
      probe.addEventListener('loadeddata', onReady, { once: true });
      probe.src = url;
      probeVideoRef.current = probe;
    }
    return () => {
      cancelled = true;
    };
  }, [hasMedia, loginMediaConfig.type, loginMediaConfig.image_url, loginMediaConfig.video_url]);

  // 配置已知后写回决策快照，供下次刷新首帧直接使用
  useEffect(() => {
    if (!mediaConfigReady) return;
    if (!hasMedia) {
      // 写 kind='none' 而不是清空：清空后下次访问无法区分「没访问过」与「确认无媒体」，
      // 会让没配媒体的站点每次刷新都先摆一次占位面板
      writeNoMediaSnapshot();
      return;
    }
    // 没有可用标识时不写缓存，避免下次刷新误判
    if (!mediaKey) return;
    writeCachedLoginMedia({
      kind: loginMediaConfig.type as 'image' | 'video',
      key: mediaKey,
      ratio: mediaRatio && mediaRatio > 0 ? mediaRatio : cachedRatio,
    });
  }, [mediaConfigReady, hasMedia, mediaKey, mediaRatio, cachedRatio, loginMediaConfig.type]);

  // 当前媒体是否已有可用直链（服务端拼好下发的 URL）；没有则渲染不出内容
  const mediaUrl = (loginMediaConfig.type === 'video'
    ? loginMediaConfig.video_url
    : loginMediaConfig.image_url) || '';
  const mediaUrlReady = mediaUrl.trim().length > 0;

  /**
   * 左侧区域形态（三态）：
   * - media：确认有媒体 → 媒体面板（按真实/缓存比例摆放）
   * - brand：确认无媒体 → 纯 CSS 品牌区（唯一的兜底内容）
   * - placeholder：**还不知道**（首次访问/清了缓存，或外观接口未返回）
   *   → 摆一块与页面同色的空面板，尺寸按媒体面板算。
   *   这样服务端说「有媒体」时是原地填内容（无切换、无闪烁）；
   *   说「没媒体」时才切品牌区（只有真的没配媒体的站点会遇到）。
   */
  type MediaPanelMode = 'media' | 'brand' | 'placeholder';
  const mediaPanelMode: MediaPanelMode = (() => {
    if (mediaConfigReady) {
      if (hasMedia && mediaUrlReady) return 'media';
      // 配置了媒体但直链缺失（后端异常）：宁可空着也不要闪品牌区
      if (hasMedia) return 'media';
      return 'brand';
    }
    // 外观还没回来：用上次快照推断，没命中就按「可能配了媒体」占位
    if (cachedMediaResult.hit && cachedMedia.kind === 'none') return 'brand';
    return 'placeholder';
  })();

  // 面板比例：实测值 > 缓存值 > 设计稿默认比例（后续实测到达时自动校正）
  const mediaPanelRatio = mediaRatio && mediaRatio > 0
    ? mediaRatio
    : cachedRatio > 0
      ? cachedRatio
      : MEDIA_RATIO_FALLBACK;

  return (
    <ConfigProvider theme={buildAuthModalAntdTheme(resolvedTheme)}>
      <div
        className={[
          'auth-modal-overlay',
          tab === 'register' ? 'auth-modal-overlay--register' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="auth-modal-stage">
          {/* 左侧三态：
              - media：确认有媒体 → 媒体面板按真实/缓存比例摆放
              - brand：确认无媒体 → 纯 CSS 品牌区（唯一兜底内容）
              - placeholder：还不知道（首次访问/清了缓存/接口未返）→ 与页面同色的
                空面板，尺寸与媒体面板一致。服务端说「有媒体」时是原地填内容，不切换不闪；
                只有真的没配媒体时才会切到 brand */}
          {mediaPanelMode === 'brand' ? (
            <AuthBrandPanel />
          ) : (
            <div
              className={[
                'auth-modal-brand',
                'auth-modal-brand--media',
                mediaPanelMode === 'placeholder' ? 'auth-modal-brand--placeholder' : '',
              ].filter(Boolean).join(' ')}
              style={{
                aspectRatio: `${mediaPanelRatio}`,
                '--auth-media-ratio': `${mediaPanelRatio}`,
              } as React.CSSProperties}
            >
              {mediaPanelMode === 'media' ? (
                <AuthLoginMedia
                  config={loginMediaConfig}
                  onMediaRatio={setMediaRatio}
                  reusedVideo={loginMediaConfig.type === 'video' ? probeVideoRef.current : null}
                />
              ) : null}
            </div>
          )}

          <div className={`auth-modal-card-layer${tab === 'register' ? ' auth-modal-card-layer--register' : ''}`}>
            <div className={`auth-modal-card${tab === 'register' ? ' auth-modal-card--register' : ' auth-modal-card--login'}`}>
              {/* 登录卡只保留标题（logo/badge 头按用户要求去掉） */}
              <h1 className="auth-modal-card-title">
                {tab === 'login' ? t('auth.welcomeLogin') : t('auth.welcomeRegister')}
              </h1>

              {tab === 'login' ? <LoginForm /> : <RegisterForm />}
            </div>
            {/* 版权行：站点页脚设置配置，展示在右侧表单区卡片下方 */}
            {copyrightText && <p className="auth-page-footer">{copyrightText}</p>}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
