import { useNavigate, useLocation } from 'react-router-dom';
import { LoginLayout } from '@lynx/shared';
import { login } from '@lynx/shared/api/dealer';
import { useDealerAuth } from '../auth';

export default function LoginPage() {
  const { signIn, authed } = useDealerAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (authed) {
    navigate('/overview', { replace: true });
  }

  const from = (location.state as { from?: string } | null)?.from || '/overview';

  /*
   * 登录用的是「商户编码 + 密码」，不是用户名。
   * 伙伴后台登录的是 lc_distribution_merchants 里的一条商户记录，
   * 由平台管理员在 admin 后台开通并分配初始密码——所以界面上写的是
   * 「商户编码」，避免有人拿自己的平台账号来试。
   */
  const handleSubmit = async (payload: { username: string; password: string }) => {
    const res = await login({ merchant_code: payload.username, password: payload.password });
    signIn(res.token, res.profile);
    navigate(from, { replace: true });
  };

  return (
    <LoginLayout
      brandName="伙伴后台"
      brandMark="P"
      headline={
        <>
          管理你的客户，
          <br />
          <em>看清每一分消耗</em>
        </>
      }
      description="面向分销伙伴的管理后台：查看名下客户、追踪调用用量、核对账单，并配置你自己域名下的品牌形象。"
      points={[
        '名下客户清单与注册信息一屏可见',
        '调用日志按模型、按时间筛选，逐笔可查',
        '14 天用量趋势与账单汇总，口径与平台一致',
        '自定义品牌名、主色与 logo，客户看到的是你的品牌',
      ]}
      formTitle="登录伙伴后台"
      formSubtitle="请使用平台分配的商户编码登录"
      accountLabel="商户编码"
      accountPlaceholder="请输入商户编码，如 self-operated"
      onSubmit={handleSubmit}
      footerNote="忘记密码请联系平台运营人员重置。"
      mockTip={
        <>
          <strong>当前为演示模式</strong>（未连接后端）。任意账号密码均可登录，所有数据为本地示例数据。
          要连真实后端，把 <code>partner/web/.env</code> 里的 <code>VITE_USE_MOCK</code> 改为 <code>false</code>。
        </>
      }
    />
  );
}
