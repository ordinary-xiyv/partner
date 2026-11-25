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
import { resolveFooterLegalLabel } from '../utils/footerLegalLabel';
import { useLocale } from '../i18n/hooks/useLocale';
import { validatePasswordComplexity } from '../utils/passwordPolicy';
import { deriveBrandPrimaryStates, mixToward, primaryRgba } from '../theme/brandTokens';
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

/** antd 主题（登录弹层内 Input 等）：跟随站点深浅主题 + 品牌主色，避免暗底上出现深字/白底 */
export function buildAuthModalAntdTheme(resolvedTheme: 'light' | 'dark', primaryHex?: string | null) {
  const isDark = resolvedTheme === 'dark';
  /*
   * 主色优先用传入的品牌色，没传才回落到原来的紫色。
   *
   * 原来这两个值是写死的 '#8b74ff' / '#6d51ff'，导致伙伴后台改了品牌色、
   * 全站都跟着变，唯独登录页的输入框描边、链接、按钮还是紫的 ——
   * 因为 antd 的 token 不读 CSS 变量，只能显式传进去。
   */
  const brand = (primaryHex || '').trim() || (isDark ? '#8b74ff' : '#6d51ff');
  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: brand,
      colorLink: brand,
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
        activeBorderColor: brand,
        hoverBorderColor: brand,
        activeShadow: '0 0 0 0 transparent',
      },
    },
  };
}

/**
 * 登录页配色令牌：把品牌主色展开成 AuthModal.css 用的那一组 `--auth-*` 变量。
 *
 * 为什么单独一个函数而不是直接在内联 style 里写几行：
 * 这些变量之间是有派生关系的（primary → light / strong / tint / 阴影 / 光晕），
 * 派生规则又随深浅模式变化。散在 JSX 里会变成一大坨三元表达式，改一次要读三遍。
 *
 * 深浅差异的取舍：
 *   · 浅色模式：主色本身够深，按钮/描边直接用主色；hover 压暗一档
 *   · 深色模式：深底上主色会发闷，把 primary-light（用于文字/链接）
 *     往白提亮 22%，保证在小字号下也读得清
 *
 * 这些比例不是随手取的：和 theme/brandTokens 里 deriveBrandPrimaryStates
 * 的 0.18 / 0.12 是同一套思路（暗色往白、浅色往黑），只是幅度略调 ——
 * 登录页字号小、留白多，提亮少了会糊。
 */
export function buildAuthThemeVars(
  resolvedTheme: 'light' | 'dark',
  primaryHex?: string | null,
): Record<string, string> {
  const isDark = resolvedTheme === 'dark';
  const base = (primaryHex || '').trim() || (isDark ? '#8b74ff' : '#6d51ff');

  const { hover, active } = deriveBrandPrimaryStates(base, resolvedTheme);
  /** 「用于文字/链接的那一档」：暗色提亮、浅色就用主色本身 */
  const light = isDark ? mixToward(base, 'white', 0.22) : base;

  /*
   * 品牌面板底色：主色的「极暗 / 极浅」版本，而不是固定的那块紫。
   *
   * 原来的值是 linear-gradient(180deg, #1f143d, #12121c, #1a0f33) ——
   * 一道深紫的渐变。主站自己用紫，看着没问题；换成青绿或橙红品牌后，
   * 左边是一整块紫、右边按钮是青绿，两种色相打架，比无色更难看得下去。
   *
   * 结构照抄原来的三段式（上带色相 → 中间沉下去 → 下方再回光），只换色相。
   * 深浅两种模式的「沉」方向相反，这个不能搞错：
   *   · 暗色：两端往黑压（带主色相的暗），中间压到接近中性黑
   *   · 浅色：两端往白提（带主色相的浅），中间提到近白
   * 都往黑压的话，浅色站点的左侧会变成一大块深色，与白色的登录卡对撞。
   */
  const panelTop = isDark ? mixToward(base, 'black', 0.84) : mixToward(base, 'white', 0.86);
  const panelMid = isDark ? '#0c0d0f' : mixToward(base, 'white', 0.96);
  const panelBottom = isDark ? mixToward(base, 'black', 0.88) : mixToward(base, 'white', 0.88);

  return {
    '--auth-primary': base,
    '--auth-primary-strong': active,
    '--auth-primary-light': light,
    '--auth-primary-tint': primaryRgba(base, isDark ? 0.18 : 0.14),
    '--auth-primary-tint-soft': primaryRgba(base, 0.06),
    '--auth-field-focus-ring': primaryRgba(base, isDark ? 0.18 : 0.15),
    '--auth-brand-panel': `linear-gradient(180deg, ${panelTop} 0%, ${panelMid} 55%, ${panelBottom} 100%)`,
    /*
     * 光晕：品牌区那两团模糊光斑。
     *
     * 两团都走品牌色，靠**透明度和位置**拉开层次，不靠换色相。
     *
     * 第二团曾经固定冷蓝 rgba(59,130,246,...)，理由是"两团同色会糊成一块"。
     * 但这个理由不成立：两团一个在左上、一个在右下，尺寸也不同，本来就分得开；
     * 而同色的后果很具体 —— 青绿品牌下面板右上青、右下蓝紫，整块底色被劈成
     * 两个色相，比"糊成一块"难看得多。
     */
    '--auth-glow-brand': primaryRgba(base, isDark ? 0.5 : 0.3),
    '--auth-glow-soft': primaryRgba(base, isDark ? 0.3 : 0.18),
    '--auth-notice-bg': isDark ? primaryRgba(base, 0.16) : softTint(base),
    '--auth-notice-text': isDark ? mixToward(base, 'white', 0.55) : base,
    '--auth-shadow-tab': `0 2px 10px ${primaryRgba(base, 0.35)}`,
    '--auth-shadow-btn': `0 8px 24px ${primaryRgba(base, 0.35)}, inset 0 1px 0 rgba(255, 255, 255, 0.18)`,
    '--auth-shadow-btn-hover': `0 10px 28px ${primaryRgba(base, 0.35)}, inset 0 1px 0 rgba(255, 255, 255, 0.22)`,
    /** 主按钮渐变：左端比主色亮一点，做出光从左上打过来的感觉 */
    '--auth-btn-gradient': `linear-gradient(90deg, ${mixToward(base, 'white', 0.08)}, ${base})`,
  };
}

/** 极浅的品牌色底（提示条底色）：往白混到几乎看不出色相，只剩一点温度 */
function softTint(hex: string): string {
  return mixToward(hex, 'white', 0.92);
}

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
  const { resolved, primaryColor } = useTheme();
  /*
   * 配色令牌必须在这里也注入一次。
   *
   * 子弹窗 createPortal 到 document.body，不在 .auth-modal-overlay 子树里，
   * 所以 overlay 上那组 --auth-* 变量它一个都取不到 —— 表现得就是
   * 「登录卡是品牌色、点进忘记密码又变回紫色」。
   * CSS 里 .auth-submodal 那行只写了 --auth-primary 一个兜底值，不够。
   */
  const themeVars = useMemo(
    () => buildAuthThemeVars(resolved, primaryColor),
    [resolved, primaryColor],
  );

  return createPortal(
    <ConfigProvider theme={buildAuthModalAntdTheme(resolved, primaryColor)}>
      <div className="auth-submodal-layer" style={themeVars as React.CSSProperties}>
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

/**
 * 品牌区特性列表图标。
 *
 * 颜色一律走 currentColor + CSS 变量，不写死 hex。
 *
 * 这里曾经按项分色：kind 0/2 用 #8B74FF（主站紫）、kind 1 用 #5B8DEF（冷蓝），
 * 后来改成"前两个跟品牌色、第三个继续冷蓝"，理由是怕三个图标同色糊成一块。
 * 两种做法都是错的：三个图标形状本来就不同（盾牌 / 折线 / 时钟），
 * 区分靠图形不靠色相；而留下一个与品牌无关的蓝，在换了品牌色之后
 * 反而是整行里最扎眼的东西。
 *
 * 现在三个统一跟随品牌主色，深浅差异由 --auth-primary-light 承担。
 */
function AuthBrandFeatureIcon({ kind }: { kind: 0 | 1 | 2 }) {
  if (kind === 0) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="auth-brand-feature-icon">
        <path d="M12 3l7 4v5c0 4.4-3 8.4-7 9-4-.6-7-4.6-7-9V7l7-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 1) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="auth-brand-feature-icon">
        <path d="M4 17l5-6 4 3 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 21h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="auth-brand-feature-icon">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  const { siteAppearance, partnerBrand, loading: appearanceLoading } = useStatus();
  const { locale } = useLocale();
  const { resolved: resolvedTheme, primaryColor } = useTheme();
  // 媒体原始宽高比（就绪后由 AuthLoginMedia 上报）；null = 尚未测得
  const [mediaRatio, setMediaRatio] = useState<number | null>(null);
  // 上次的媒体决策快照：服务端外观尚未就绪时先用它决定首帧形态，
  // 避免「已配置媒体」的站点每次刷新都先闪一下品牌兜底区。
  // hit=false 表示从没访问过（新浏览器/清缓存），此时不知有无媒体
  const cachedMediaResult = useMemo(() => readCachedLoginMedia(), []);
  const cachedMedia = cachedMediaResult.snapshot;

  /** 登录页配色令牌（品牌主色 → --auth-* 那一组），随深浅模式重算 */
  const themeVars = useMemo(
    () => buildAuthThemeVars(resolvedTheme, primaryColor),
    [resolvedTheme, primaryColor],
  );

  /*
   * 登录页左栏媒体：**经销商一律不显示，自营站（平台自己）才用平台的。**
   *
   * 视频那条链路是历史遗留。它挂在平台侧的站点外观（login_media_config）上，
   * 由平台运维在 lynxtonapi 后台上传，**伙伴后台（本仓库 web）没有对应的
   * 配置入口** —— 商户在自己的后台翻遍所有页面也找不到那一格。结果就是
   * 每个分销商站点都顶着同一段平台宣传片：换不掉，也关不掉。
   *
   * 所以这里做一次收口：服务端就算下发 type='video'，也按 none 处理，
   * 左栏回落到纯 CSS 品牌区（AuthBrandPanel）。
   *
   * ★ 图片同样不能给经销商。
   *
   * 之前这里「保留图片」，理由是「一张静态图即使商户改不了也不构成干扰」。
   * 这条理由站不住：那张图是**平台（灵通云 tokens）的资产**，挂在经销商的
   * 域名和登录页上，访客会以为这个站是平台开的。这和「经销商继承了平台的
   * 客服二维码 / favicon」是同一类问题，不能因为它是静态图就放过。
   *
   * 判据与全站一致：只有平台站（is_self_operated === true）才用平台的图片；
   * 经销商（false）与第三态（undefined，旧版后端没下发）都当没有 ——
   * 这里和别处不同：别处第三态按自营放行是为了保住主站，但这里放行的
   * 代价是「经销商登录页出现平台宣传图」，而漏掉的代价只是「平台站的
   * 登录页暂时没有配图」—— 平台站自己本来就很少配这张图，且升级后立刻恢复。
   * 权衡下来这里选择收紧。
   *
   * 为什么不直接把服务端那条记录改掉：login_media_config 落在 lynxtonapi
   * 的库表里，本仓库只读；而且同一条记录可能还被主站自己的登录页用着。
   * 收在渲染层，既立刻生效，又不影响别人。
   */
  const loginMediaConfig: AuthLoginMediaConfig = (() => {
    const raw = siteAppearance?.login_media_config;
    if (!raw || raw.type !== 'image') return { type: 'none' };
    // 只有平台站能用平台的登录页配图；经销商与未知站点一律不用
    if (partnerBrand?.is_self_operated !== true) return { type: 'none' };
    return {
      type: 'image',
      image_url: raw.image_url,
    };
  })();

  /*
   * 版权行：读站点「页脚设置」配置（版权 labels / legacy），与全站页脚同源。
   *
   * 三个开关都要尊重，缺一不可：
   *   ① footer_copyright_config.enabled —— 伙伴后台「显示页脚」总开关
   *   ② footer_hidden_items 含 copyright —— 商户明确清空了版权这一项
   *   ③ 文字非空 —— 什么都没有就没必要渲染一行空白
   *
   * 这里曾经只判了 ③，所以伙伴后台把「显示页脚」关掉之后，全站页脚没了、
   * 登录页底部那句「© 2026 联通云有限公司 版权所有」还在 —— 而且写的是
   * 平台公司名，挂在分销商站上等于给平台打广告。
   */
  /*
   * 判定改成「显式不为 false 才显示」→ 保持，但把「加载中」单独挡掉。
   *
   * 原来的写法 `!== false` 看起来安全，实际上把两种完全不同的状态归成了同一类：
   *   · 配置已到、商户明确开着   → true   → 显示（正确）
   *   · 配置还没到，值是 undefined → 显示（碰巧也对，但理由不成立）
   * 后一种之所以现在没出问题，是因为 useStatus 的 siteAppearance 有完整的
   * 默认值兜底、合并函数也保证这个字段是布尔值。一旦哪天默认值或合并链路
   * 有改动（比如某个分支漏填），这里会在等配置的那几百毫秒里先闪一句
   * 平台版权文字，然后才被真实配置替换 —— 和品牌色闪烁是同一类问题。
   *
   * 所以先判 appearanceLoading：没拿到配置就不渲染。反正这段时间本来
   * 也不该出现版权行。
   */
  const copyrightEnabled = !appearanceLoading && siteAppearance?.footer_copyright_config?.enabled !== false;
  const copyrightHidden = (siteAppearance?.footer_hidden_items ?? []).includes('copyright');
  const copyrightText = useMemo(
    () => (copyrightEnabled && !copyrightHidden
      ? resolveFooterLegalLabel(
        siteAppearance?.copyright_labels,
        siteAppearance?.copyright_text,
        locale,
        `${new Date().getFullYear()} {{brandName}}`,
      ).replace('{{brandName}}', t('header.systemName'))
      : ''),
    [
      copyrightEnabled,
      copyrightHidden,
      siteAppearance?.copyright_labels,
      siteAppearance?.copyright_text,
      locale,
      t,
    ],
  );

  const hasMedia = loginMediaConfig.type !== 'none';
  // 外观接口是否已返回（未返回时 type='none' 不代表「真的没配置」，只代表「还不知道」）
  const mediaConfigReady = !appearanceLoading;

  // 媒体标识：file_id 优先（刷新首帧只有 file_id，URL 要等接口返回才有），
  // 保证同一媒体在「接口返回前/后」算出同一个键，缓存才能命中
  const mediaKey = buildMediaCacheKey(
    loginMediaConfig.type,
    siteAppearance?.login_media_config?.image_file_id,
    loginMediaConfig.image_url,
  );
  // 缓存仅在标识一致时可用，避免换/删媒体后沿用旧比例
  const cachedRatio = cachedMedia.key && cachedMedia.key === mediaKey ? cachedMedia.ratio : 0;

  // 媒体变化（换图/清空）时重置比例，避免沿用旧媒体的 aspect-ratio
  useEffect(() => {
    setMediaRatio(null);
  }, [loginMediaConfig.type, loginMediaConfig.image_url]);

  // 图片元数据预加载：尽早拿到真实宽高比，首帧就按正确比例摆好面板
  useEffect(() => {
    if (!hasMedia) return undefined;
    const url = loginMediaConfig.image_url || '';
    if (!url) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setMediaRatio(probe.naturalWidth / probe.naturalHeight);
      }
    };
    probe.src = url;
    return () => {
      cancelled = true;
    };
  }, [hasMedia, loginMediaConfig.image_url]);

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

  // 当前媒是否有可用直链（服务端拼好下发的 URL）；没有则渲染不出内容
  const mediaUrl = loginMediaConfig.image_url || '';
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
    <ConfigProvider theme={buildAuthModalAntdTheme(resolvedTheme, primaryColor)}>
      <div
        className={[
          'auth-modal-overlay',
          tab === 'register' ? 'auth-modal-overlay--register' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={themeVars as React.CSSProperties}
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
