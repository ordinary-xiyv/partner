import React, { useState } from 'react';
import { Alert, Button, Input } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { USE_MOCK, extractErrorMessage } from '@lynx/shared';
import './login.css';

export interface LoginLayoutProps {
  /** 品牌区标题 */
  brandName: string;
  brandMark?: string;
  /** 品牌标识节点（支持 logo 图）；不传则用 brandMark 首字 */
  brandLogo?: React.ReactNode;
  headline: React.ReactNode;
  description: string;
  points?: string[];
  /** 表单标题 / 副标题 */
  formTitle: string;
  formSubtitle: string;
  /**
   * 账号输入框的标签与占位符。
   *
   * 默认是「账号 / 请输入账号」，适用于登录 users 表的场景。
   * 伙伴后台登录的是商户记录（lc_distribution_merchants），
   * 后端要的字段是 merchant_code，界面写「账号」会让人不知道填什么——
   * 商户编码和用户名的格式不一样（前者是平台分配的，形如 self-operated）。
   */
  accountLabel?: string;
  accountPlaceholder?: string;
  /** 提交 */
  onSubmit: (payload: { username: string; password: string }) => Promise<void>;
  /** 底部占位内容（如客服联系方式） */
  footerNote?: React.ReactNode;
  /** mock 模式下的提示文案 */
  mockTip?: React.ReactNode;
  /** 右上角附加操作 */
  extra?: React.ReactNode;
  /** 表单下方链接区（返回首页 / 去注册），与 footerNote 分开：
   *  footerNote 讲「账号怎么来」，bottomLinks 是导航动作，混在一起会读不出重点 */
  bottomLinks?: React.ReactNode;
}

/** 登录页通用骨架：左侧品牌叙事 + 右侧表单 */
export function LoginLayout({
  brandName,
  brandMark,
  brandLogo,
  headline,
  description,
  points = [],
  formTitle,
  formSubtitle,
  accountLabel = '账号',
  accountPlaceholder = '请输入账号',
  onSubmit,
  footerNote,
  mockTip,
  extra,
  bottomLinks,
}: LoginLayoutProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSubmit({ username: username.trim(), password });
    } catch (err) {
      setError(extractErrorMessage(err) || '登录失败，请检查账号密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lynx-login">
      <section className="lynx-login__brand">
        <div className="lynx-login__brand-inner">
          <div className="lynx-login__logo-row">
            {brandLogo ?? <div className="lynx-login__logo">{brandMark || brandName.slice(0, 1)}</div>}
            <span className="lynx-login__logo-text">{brandName}</span>
          </div>

          <h1 className="lynx-login__headline">{headline}</h1>
          <p className="lynx-login__sub">{description}</p>

          {points.length > 0 && (
            <div className="lynx-login__points">
              {points.map((p) => (
                <div className="lynx-login__point" key={p}>
                  <span className="lynx-login__point-dot" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lynx-login__foot">
          © {new Date().getFullYear()} {brandName}
        </div>
      </section>

      <section className="lynx-login__panel">
        <div className="lynx-login__form">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="lynx-login__form-title">{formTitle}</div>
              <div className="lynx-login__form-sub">{formSubtitle}</div>
            </div>
            {extra}
          </div>

          {error ? (
            <Alert
              type="error"
              message={error}
              showIcon
              style={{ marginBottom: 18, fontSize: 13 }}
            />
          ) : null}

          <div className="lynx-login__field">
            <label className="lynx-login__field-label">{accountLabel}</label>
            <Input
              size="large"
              prefix={<UserOutlined style={{ color: 'var(--text-tertiary)' }} />}
              placeholder={accountPlaceholder}
              value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              onPressEnter={submit}
            />
          </div>

          <div className="lynx-login__field">
            <label className="lynx-login__field-label">密码</label>
            <Input.Password
              size="large"
              prefix={<LockOutlined style={{ color: 'var(--text-tertiary)' }} />}
              placeholder="请输入密码"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={submit}
            />
          </div>

          <Button
            type="primary"
            size="large"
            block
            loading={loading}
            onClick={submit}
            style={{ height: 44, fontWeight: 600 }}
          >
            登录
          </Button>

          {bottomLinks ? <div className="lynx-login__links">{bottomLinks}</div> : null}

          {footerNote ? <div className="lynx-login__hint">{footerNote}</div> : null}

          {USE_MOCK && mockTip ? <div className="lynx-login__mock-tip">{mockTip}</div> : null}
        </div>
      </section>
    </div>
  );
}
