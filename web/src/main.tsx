import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Merchant = {
  merchant_id: number;
  merchant_name: string;
  merchant_code: string;
  password_change_required: boolean;
};

type PartnerUser = {
  id: number;
  username: string;
  display_name: string;
  email: string;
  phone?: string;
  status: number;
  created_time?: string;
};

type PartnerUserPage = { items: PartnerUser[]; total: number; page: number; page_size: number };

type PartnerLog = {
  id: number; created_at: number; user_id: number; username: string; type: number;
  model_name: string; prompt_tokens: number; completion_tokens: number; cache_read: number;
  use_time: number; is_stream: boolean; quota: number; amount_cny: number; request_id: string;
};
type PartnerLogPage = { items: PartnerLog[]; total: number; page: number; page_size: number };
type TrendDay = { summary_date: string; prompt_tokens: number; completion_tokens: number; request_count: number; quota: number; amount_cny: number };
type TrendResponse = { items: TrendDay[] };
type TrendMetric = 'tokens' | 'requests' | 'quota';
type BillingUser = { user_id: number; username: string; deleted: boolean; request_count: number; quota: number; amount_cny: number };
type BillingSummary = {
  start_date: string; end_date: string; total_users: number; total_requests: number;
  total_quota: number; total_amount_cny: number; quota_per_unit: number;
  items: BillingUser[]; page: number; page_size: number;
};
type BillingRange = { startDate: string; endDate: string };
const emptyBillingRange: BillingRange = { startDate: '', endDate: '' };
type LogSearch = { userId: string; model: string; requestId: string; type: string; startDate: string; endDate: string };
const emptyLogSearch: LogSearch = { userId: '', model: '', requestId: '', type: '', startDate: '', endDate: '' };
function shanghaiToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (name: string) => parts.find(item => item.type === name)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function defaultLogSearch(): LogSearch {
  const today = shanghaiToday();
  return { ...emptyLogSearch, startDate: today, endDate: today };
}
const logTypeLabels: Record<number, string> = { 2: '消费', 5: '错误', 6: '退款', 7: '预扣', 8: '补扣' };

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const url = `/api/partner${path}`;
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let result: { success?: boolean; message?: string; data?: T };
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = {};
  }
  if (!response.ok || !result.success) {
    throw new ApiRequestError(result.message || `接口 ${url} 返回 HTTP ${response.status}，且没有有效 JSON。请检查伙伴前端代理目标与 admin 后端是否已启动。`, response.status);
  }
  return result.data as T;
}

const numberFormat = new Intl.NumberFormat('zh-CN');
const cnyFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const formatCNY = (amount: number) => `¥${cnyFormat.format(amount)}`;
const expectedMerchantCodeKey = 'lynxton_partner_expected_merchant_code';
function TrendCard({ days, loading, error }: { days: TrendDay[]; loading: boolean; error: string }) {
  const [metric, setMetric] = useState<TrendMetric>('tokens');
  const metrics: { key: TrendMetric; label: string; value: (day: TrendDay) => number }[] = [
    { key: 'tokens', label: 'Token 用量', value: day => day.prompt_tokens + day.completion_tokens },
    { key: 'requests', label: '调用次数', value: day => day.request_count },
    { key: 'quota', label: '消费金额（人民币）', value: day => day.amount_cny },
  ];
  const selected = metrics.find(item => item.key === metric)!;
  const values = days.map(selected.value);
  const scale = Math.max(1, ...values.map(value => Math.max(0, value)));
  return <section className="panel trend-panel">
    <div className="panel-head"><div><h2>近 14 天调用趋势</h2><p className="muted">上海时区过去 14 个完整自然日，不含今天；仅统计当前商户用户。</p></div></div>
    {error ? <p className="error" role="alert">{error}</p> : loading ? <p className="muted">正在加载趋势…</p> : <>
      <div className="trend-stats">{metrics.map(item => <div key={item.key}><span>{item.label}</span><strong>{item.key === 'quota' ? formatCNY(days.reduce((sum, day) => sum + item.value(day), 0)) : numberFormat.format(days.reduce((sum, day) => sum + item.value(day), 0))}</strong></div>)}</div>
      <div className="trend-metrics" role="tablist" aria-label="趋势指标">{metrics.map(item => <button key={item.key} type="button" role="tab" aria-selected={metric === item.key} className={metric === item.key ? 'selected' : ''} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div>
      <div className="trend-chart" role="img" aria-label={`${selected.label}近 14 天趋势`}>
        {days.map((day, index) => <div className="trend-day" key={day.summary_date} title={`${day.summary_date}：${metric === 'quota' ? formatCNY(values[index]) : numberFormat.format(values[index])}`}>
          <div className="trend-bar-area"><div className="trend-bar" style={{ height: values[index] > 0 ? `${Math.max(3, values[index] / scale * 100)}%` : '0%' }} /></div>
          <span>{day.summary_date.slice(5)}</span>
        </div>)}
      </div>
    </>}
  </section>;
}

function App() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [users, setUsers] = useState<PartnerUserPage | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'users' | 'logs' | 'billing'>('users');
  const [logs, setLogs] = useState<PartnerLogPage | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState('');
  const [logUnavailable, setLogUnavailable] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logRefresh, setLogRefresh] = useState(0);
  const [logInput, setLogInput] = useState<LogSearch>(defaultLogSearch);
  const [logFilter, setLogFilter] = useState<LogSearch>(defaultLogSearch);
  const [trendDays, setTrendDays] = useState<TrendDay[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState('');
  const [billingPage, setBillingPage] = useState(1);
  const [billingInput, setBillingInput] = useState<BillingRange>(emptyBillingRange);
  const [billingRange, setBillingRange] = useState<BillingRange>(emptyBillingRange);
  const [billingRefresh, setBillingRefresh] = useState(0);

  useEffect(() => {
    request<Merchant>('/me').then(data => {
      const expected = sessionStorage.getItem(expectedMerchantCodeKey);
      if (expected && expected !== data.merchant_code) {
        setCode(expected);
        setError(`当前浏览器的伙伴会话已切换为 ${data.merchant_code}。请重新登录 ${expected}，或使用独立浏览器窗口同时管理两个商户。`);
        setMerchant(null);
        return;
      }
      sessionStorage.setItem(expectedMerchantCodeKey, data.merchant_code);
      setMerchant(data);
    }).catch(() => setMerchant(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!merchant || merchant.password_change_required) return;
    let active = true;
    setTrendLoading(true); setTrendError('');
    request<TrendResponse>('/daily-trend')
      .then(data => { if (active) setTrendDays(data.items || []); })
      .catch(err => { if (active) setTrendError((err as Error).message); })
      .finally(() => { if (active) setTrendLoading(false); });
    return () => { active = false; };
  }, [merchant?.merchant_id, merchant?.password_change_required]);

  useEffect(() => {
    if (!merchant || merchant.password_change_required || activeTab !== 'users') return;
    let active = true;
    setUserLoading(true);
    setUserError('');
    setUsers(null);
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (keyword) params.set('keyword', keyword);
    request<PartnerUserPage>(`/users?${params.toString()}`)
      .then(data => { if (active) setUsers(data); })
      .catch(err => { if (active) setUserError((err as Error).message); })
      .finally(() => { if (active) setUserLoading(false); });
    return () => { active = false; };
  }, [merchant?.merchant_id, merchant?.password_change_required, activeTab, keyword, page]);

  useEffect(() => {
    if (!merchant || merchant.password_change_required || activeTab !== 'logs') return;
    let active = true;
    setLogLoading(true); setLogError(''); setLogUnavailable(false); setLogs(null);
    const params = new URLSearchParams({ page: String(logPage), page_size: '20' });
    if (logFilter.userId) params.set('user_id', logFilter.userId);
    if (logFilter.model) params.set('model_name', logFilter.model);
    if (logFilter.requestId) params.set('request_id', logFilter.requestId);
    if (logFilter.type) params.set('type', logFilter.type);
    if (logFilter.startDate) params.set('start_timestamp', String(Math.floor(new Date(`${logFilter.startDate}T00:00:00+08:00`).getTime() / 1000)));
    if (logFilter.endDate) params.set('end_timestamp', String(Math.floor(new Date(`${logFilter.endDate}T23:59:59+08:00`).getTime() / 1000)));
    if (!logFilter.startDate && !logFilter.endDate) params.set('all_history', '1');
    request<PartnerLogPage>(`/logs?${params.toString()}`)
      .then(data => { if (active) setLogs(data); })
      .catch(err => {
        if (!active) return;
        if (err instanceof ApiRequestError && err.status === 404) {
          setLogs({ items: [], total: 0, page: logPage, page_size: 20 });
          setLogUnavailable(true);
          setLogError('日志接口暂不可用。请确认 admin 后端已更新并重启，然后刷新页面。');
          return;
        }
        setLogError((err as Error).message);
      })
      .finally(() => { if (active) setLogLoading(false); });
    return () => { active = false; };
  }, [merchant?.merchant_id, merchant?.password_change_required, activeTab, logFilter, logPage, logRefresh]);

  useEffect(() => {
    if (!merchant || merchant.password_change_required || activeTab !== 'billing') return;
    let active = true;
    setBillingLoading(true); setBillingError(''); setBilling(null);
    const params = new URLSearchParams({ page: String(billingPage), page_size: '20' });
    if (billingRange.startDate && billingRange.endDate) {
      params.set('start_date', billingRange.startDate);
      params.set('end_date', billingRange.endDate);
    }
    request<BillingSummary>(`/billing/summary?${params.toString()}`)
      .then(data => { if (active) setBilling(data); })
      .catch(err => { if (active) setBillingError((err as Error).message); })
      .finally(() => { if (active) setBillingLoading(false); });
    return () => { active = false; };
  }, [merchant?.merchant_id, merchant?.password_change_required, activeTab, billingPage, billingRange, billingRefresh]);

  async function login(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await request<Merchant>('/login', 'POST', { merchant_code: code.trim(), password });
      sessionStorage.setItem(expectedMerchantCodeKey, data.merchant_code);
      setMerchant(data);
      if (!data.password_change_required) setPassword('');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await request('/password', 'POST', { current_password: password, new_password: newPassword });
      setMerchant(await request<Merchant>('/me'));
      setPassword(''); setNewPassword('');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function logout() {
    setError(''); setBusy(true);
    try { await request('/logout', 'POST'); sessionStorage.removeItem(expectedMerchantCodeKey); setMerchant(null); setUsers(null); setLogs(null); setBilling(null); setTrendDays([]); setPassword(''); setNewPassword(''); setKeyword(''); setSearchInput(''); setPage(1); setLogPage(1); setLogInput(defaultLogSearch()); setLogFilter(defaultLogSearch()); setBillingPage(1); setBillingInput(emptyBillingRange); setBillingRange(emptyBillingRange); setActiveTab('users'); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header className="brand"><span className="brand-mark">L</span><span>伙伴后台</span></header>
    {loading ? <section className="card"><p>正在检查登录状态…</p></section> :
      !merchant ? <section className="card">
        <p className="eyebrow">PARTNER CONSOLE</p><h1>登录伙伴后台</h1>
        <p className="muted">使用平台管理员发放的商户编码和初始密码。</p>
        <form onSubmit={login}>
          <label>商户编码<input autoFocus required autoComplete="username" value={code} onChange={e => setCode(e.target.value)} /></label>
          <label>密码<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={busy}>{busy ? '登录中…' : '登录'}</button>
        </form>
      </section> : merchant.password_change_required ? <section className="card">
        <p className="eyebrow">首次登录</p><h1>设置新密码</h1>
        <p className="muted">{merchant.merchant_name} · {merchant.merchant_code}</p>
        <form onSubmit={changePassword}>
          <label>初始密码<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>新密码<input required type="password" autoComplete="new-password" minLength={12} maxLength={72} value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
          <p className="muted">新密码至少 12 个字符。</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={busy}>{busy ? '保存中…' : '保存新密码'}</button>
        </form>
        <button className="text-button" onClick={() => void logout()}>退出登录</button>
      </section> : <section className="dashboard">
        <div className="dashboard-head">
          <div><p className="eyebrow">PARTNER CONSOLE</p><h1>{merchant.merchant_name}</h1><p className="muted">商户编码：{merchant.merchant_code}</p></div>
          <button className="text-button" onClick={() => void logout()}>退出登录</button>
        </div>
        <TrendCard days={trendDays} loading={trendLoading} error={trendError} />
        <nav className="tabs" aria-label="伙伴后台功能">
          <button className={activeTab === 'users' ? 'selected' : ''} onClick={() => setActiveTab('users')}>用户管理</button>
          <button className={activeTab === 'logs' ? 'selected' : ''} onClick={() => setActiveTab('logs')}>调用日志</button>
          <button className={activeTab === 'billing' ? 'selected' : ''} onClick={() => setActiveTab('billing')}>消费账单</button>
        </nav>
        {activeTab === 'users' ? <div className="panel">
          <div className="panel-head">
            <div><h2>用户管理</h2><p className="muted">仅显示当前商户的普通用户。{users && `共 ${users.total} 人`}</p></div>
            <form className="search-form" onSubmit={event => { event.preventDefault(); setPage(1); setKeyword(searchInput.trim()); }}>
              <input aria-label="搜索用户" placeholder="搜索 ID、用户名、邮箱或手机号" value={searchInput} onChange={event => setSearchInput(event.target.value)} />
              <button type="submit">搜索</button>
            </form>
          </div>
          {userError && <p className="error" role="alert">{userError}</p>}
          {userLoading ? <p className="muted">正在加载用户…</p> : users && <>
            <div className="table-wrap"><table>
              <thead><tr><th>ID</th><th>用户名</th><th>显示名</th><th>邮箱</th><th>手机号</th><th>状态</th><th>创建时间</th></tr></thead>
              <tbody>{users.items.map(user => <tr key={user.id}>
                <td>{user.id}</td><td>{user.username}</td><td>{user.display_name || '—'}</td><td>{user.email || '—'}</td><td>{user.phone || '—'}</td>
                <td>{user.status === 1 ? '正常' : '停用'}</td><td>{user.created_time ? new Date(user.created_time).toLocaleString('zh-CN') : '—'}</td>
              </tr>)}</tbody>
            </table></div>
            {users.items.length === 0 && <p className="empty">没有找到用户</p>}
            <div className="pagination">
              <span>第 {users.page} 页</span>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
              <button disabled={page * users.page_size >= users.total} onClick={() => setPage(page + 1)}>下一页</button>
            </div>
          </>}
        </div> : activeTab === 'logs' ? <div className="panel">
          <div className="panel-head"><div><h2>调用日志</h2><p className="muted">默认显示上海时区今天、当前商户全部普通用户的调用日志。{logs && !logUnavailable && `共 ${logs.total} 条`}</p></div></div>
          <form className="log-search" onSubmit={event => { event.preventDefault(); setLogPage(1); setLogFilter({ ...logInput, userId: logInput.userId.trim(), model: logInput.model.trim(), requestId: logInput.requestId.trim() }); }}>
            <label>用户 ID<input type="number" min="1" placeholder="全部用户" value={logInput.userId} onChange={event => setLogInput({ ...logInput, userId: event.target.value })} /></label>
            <label>模型<input placeholder="模型名称" value={logInput.model} onChange={event => setLogInput({ ...logInput, model: event.target.value })} /></label>
            <label>请求 ID<input placeholder="精确匹配" value={logInput.requestId} onChange={event => setLogInput({ ...logInput, requestId: event.target.value })} /></label>
            <label>类型<select value={logInput.type} onChange={event => setLogInput({ ...logInput, type: event.target.value })}>
              <option value="">全部</option>{Object.entries(logTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>开始日期<input type="date" value={logInput.startDate} onChange={event => setLogInput({ ...logInput, startDate: event.target.value })} /></label>
            <label>结束日期<input type="date" value={logInput.endDate} onChange={event => setLogInput({ ...logInput, endDate: event.target.value })} /></label>
            <button type="submit">查询</button>
            <button type="button" className="secondary-button" onClick={() => { const today = defaultLogSearch(); setLogInput(today); setLogFilter(today); setLogPage(1); setLogRefresh(value => value + 1); }}>今天</button>
            <button type="button" className="secondary-button" onClick={() => { setLogInput(emptyLogSearch); setLogFilter(emptyLogSearch); setLogPage(1); setLogRefresh(value => value + 1); }}>全部日期</button>
            <button type="button" className="secondary-button" onClick={() => setLogRefresh(value => value + 1)}>刷新</button>
          </form>
          {logError && <p className="error" role="alert">{logError}</p>}
          {logLoading ? <p className="muted">正在加载日志…</p> : logs && !logUnavailable && <>
            <div className="table-wrap"><table>
              <thead><tr><th>时间</th><th>用户</th><th>类型</th><th>模型</th><th>输入 Token</th><th>输出 Token</th><th>缓存读取</th><th>耗时</th><th>金额变动（人民币）</th><th>请求 ID</th></tr></thead>
              <tbody>{logs.items.map(log => <tr key={log.id}>
                <td>{new Date(log.created_at * 1000).toLocaleString('zh-CN')}</td><td>{log.username}（{log.user_id}）</td>
                <td>{logTypeLabels[log.type] || log.type}</td><td>{log.model_name || '—'}</td>
                <td>{log.prompt_tokens}</td><td>{log.completion_tokens}</td><td>{log.cache_read}</td>
                <td>{log.use_time} 秒{log.is_stream ? ' · 流式' : ''}</td>
                <td>{log.type === 6 ? '+' : [2, 7, 8].includes(log.type) ? '−' : ''}{formatCNY(log.amount_cny)}</td>
                <td className="request-id">{log.request_id || '—'}</td>
              </tr>)}</tbody>
            </table></div>
            {logs.items.length === 0 && <p className="empty">没有找到日志</p>}
            <div className="pagination">
              <span>第 {logs.page} 页</span>
              <button disabled={logPage <= 1} onClick={() => setLogPage(logPage - 1)}>上一页</button>
              <button disabled={logPage * logs.page_size >= logs.total} onClick={() => setLogPage(logPage + 1)}>下一页</button>
            </div>
          </>}
        </div> : <div className="panel">
          <div className="panel-head"><div><h2>消费账单</h2><p className="muted">默认本月；按当前商户用户的消费日志实时汇总，包含今天。</p></div></div>
          <form className="billing-search" onSubmit={event => {
            event.preventDefault();
            if (billingInput.startDate !== '' && billingInput.endDate !== '' && billingInput.startDate > billingInput.endDate) { setBillingError('结束日期不能早于开始日期'); return; }
            if ((billingInput.startDate === '') !== (billingInput.endDate === '')) { setBillingError('请选择完整的开始和结束日期'); return; }
            setBillingPage(1); setBillingRange({ ...billingInput });
          }}>
            <label>开始日期<input type="date" value={billingInput.startDate} onChange={event => setBillingInput({ ...billingInput, startDate: event.target.value })} /></label>
            <label>结束日期<input type="date" value={billingInput.endDate} onChange={event => setBillingInput({ ...billingInput, endDate: event.target.value })} /></label>
            <button type="submit">查询</button>
            <button type="button" className="secondary-button" onClick={() => { setBillingInput(emptyBillingRange); setBillingRange(emptyBillingRange); setBillingPage(1); setBillingRefresh(value => value + 1); }}>本月</button>
            <button type="button" className="secondary-button" onClick={() => setBillingRefresh(value => value + 1)}>刷新</button>
          </form>
          {billingError && <p className="error" role="alert">{billingError}</p>}
          {billingLoading ? <p className="muted">正在汇总消费…</p> : billing && <>
            <p className="billing-period">统计区间：{billing.start_date} 至 {billing.end_date} · 每 500000 额度折合人民币 1 元，非商户结算金额</p>
            <div className="billing-stats">
              <div><span>净消费金额（人民币）</span><strong>{formatCNY(billing.total_amount_cny)}</strong></div>
              <div><span>调用次数</span><strong>{numberFormat.format(billing.total_requests)}</strong></div>
              <div><span>消费用户数</span><strong>{numberFormat.format(billing.total_users)}</strong></div>
            </div>
            <div className="table-wrap"><table>
              <thead><tr><th>用户 ID</th><th>用户名</th><th>调用次数</th><th>净消费金额（人民币）</th></tr></thead>
              <tbody>{billing.items.map(row => <tr key={row.user_id}>
                <td>{row.user_id}</td><td>{row.username}{row.deleted ? '（已删除）' : ''}</td>
                <td>{numberFormat.format(row.request_count)}</td><td>{formatCNY(row.amount_cny)}</td>
              </tr>)}</tbody>
            </table></div>
            {billing.items.length === 0 && <p className="empty">该日期范围没有消费记录</p>}
            <div className="pagination">
              <span>第 {billing.page} 页，共 {billing.total_users} 位用户</span>
              <button disabled={billingPage <= 1} onClick={() => setBillingPage(billingPage - 1)}>上一页</button>
              <button disabled={billingPage * billing.page_size >= billing.total_users} onClick={() => setBillingPage(billingPage + 1)}>下一页</button>
            </div>
          </>}
        </div>}
      </section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
