# Lynxton Partner

独立伙伴平台。`backend/` 是仅提供 `/api/partner/*` 的 Go 服务，`web/` 是伙伴后台前端（React + Vite + antd）。与原平台共用数据库，不包含 admin 管理接口，也不自动迁移数据库。

「伙伴」与「经销商」在数据模型上是同一个东西：都指向 `lc_distribution_merchants` 表的一条记录。伙伴登录用的是该表上的 `merchant_code` + `partner_password_hash`，不是 `users` 表的账号。

## 本地运行

先在原项目手工执行伙伴登录 SQL（`202611190001_distribution_merchant_partner_login.up.sql`，以及它依赖的商户表迁移）。平台管理员仍在 admin 后台开通伙伴登录、重置初始密码。

```bash
cd backend
cp .env.example .env
# 编辑 .env，然后将变量导入当前 shell；Go 程序不会自动读取 .env
set -a; source .env; set +a
go run .
```

默认监听 `127.0.0.1:3004`。`SQL_DSN` 要连接原平台的同一数据库，且 `users`、`logs`、`lc_log_daily_summaries` 必须共库。`PARTNER_SESSION_SECRET` 必须至少 32 字符；如果想保留拆分前的登录会话，沿用原 admin 的 `PARTNER_SESSION_SECRET`。生产环境设置 `SESSION_COOKIE_SECURE=true` 并用 HTTPS 反代。`/healthz` 用于健康检查。

```bash
cd web
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5176`。Vite 默认代理 `/api/partner` 到 `127.0.0.1:3004`；其他地址用 `PARTNER_API_TARGET` 指定。生产部署时，伙伴前端和伙伴 API 应在同一域名，反向代理 `/api/partner/` 到本服务，其他页面由前端静态服务提供。

前端 `.env` 里 `VITE_USE_MOCK` 默认为 `false`，即直接请求真实后端。只有当后端没起、只想看界面时才改成 `true`。

## 鉴权

伙伴后台用 **cookie session**，不是 Bearer token：

- 登录成功后服务端种 `HttpOnly` cookie，`Path=/api/partner`，`SameSite=Strict`
- axios 必须 `withCredentials: true`，否则跨源不带 cookie，表现是「密码输对了仍被踢回登录页」
- 前端 `localStorage` 只存一个 `'cookie-session'` 哨兵值表示「我登录过」，不存真凭证（cookie 是 HttpOnly，JS 读不到）
- 每次认证请求都从 `lc_distribution_merchants` 重读 `partner_login_enabled` 与 `partner_session_version`，改密码或禁用登录会立刻使旧会话失效

## 接口现状

`web/src/shared/api/endpoints.ts` 是唯一的端点表，必须与 `backend/main.go` 的注册一致。后端没实现的写成 `null`，请求层会抛 `ApiNotReadyError`（提示「接口尚未实现」），而不是打到一个不存在的 URL 上拿 404——404 会让人误以为路径拼错或服务没起。

**已连通**：登录、退出、当前商户、改密、用户列表与搜索、调用日志、14 天趋势、账单汇总。

**未实现（对应页面会提示接口未实现）**：

- 品牌白标 `GET/PUT /api/partner/brand`、`POST /api/partner/brand/upload`、`/brand/domains`
  —— 实现在 `lynxtonapi/internal-admin/distributormerchant/partner_brand.go`（328 行），可直接移植
- 佣金、结算、提现
- 定价策略
- 邀请码
- 客户写操作（改额度、启停、重置密码）

概览页没有 `/overview` 接口，由前端用 `users` + `daily-trend` 两个真接口拼出；佣金类字段填 0，不凭空编造比例。

## 易错点

- `/logs` 在既不传时间范围、也不传 `all_history=1` 时**默认只看今天**。页面语义是「不带时间条件 = 看全部」，所以 `fetchUsageLogs` 会显式补 `all_history=1`
- 日志 `type` 字段里 `5` 表示错误，其余按成功（宁可把失败记成成功，也不要把成功记成失败）
- 改密接口是 `POST` 不是 `PUT`，字段是 `current_password` 不是 `old_password`
- Vite alias 必须用数组 + 正则：`^@lynx\/shared\/(.*)$` 放前、`^@lynx\/shared$` 放后。用对象字面量会按 key 顺序把 `@lynx/shared/api/dealer` 拼成 `src/shared/index.ts/api/dealer`，报 `ENOTDIR`

## 验证

```bash
cd backend && go test ./...
cd web && npm run typecheck && npm run build
```
