# Lynxton Partner

独立伙伴平台。仓库里有三块东西，**它们连的后端不是同一个**，先看清这一节再动代码：

| 目录 | 是什么 | 连哪个后端 | 本地端口 |
|---|---|---|---|
| `backend/` | 伙伴平台自己的 Go 服务，只提供 `/api/partner/*` | —— | 3004 |
| `web/` | **伙伴后台**前端（React + Vite + antd） | `backend/`（即 `127.0.0.1:3004`） | 5176 |
| `web-user/` | **商户侧（C 端）站点**前端 | **不是本仓库后端**，是 `lynxtonapi` 项目的 internal-user 服务，经反向代理接入 | 5173 |

「伙伴」与「经销商」在数据模型上是同一个东西：都指向 `lc_distribution_merchants` 表的一条记录。伙伴登录用的是该表上的 `merchant_code` + `partner_password_hash`，不是 `users` 表的账号。

## web-user 说明

`web-user/` 是 `lynxtonapi/web` 的商户侧裁剪版（`package.json` 的 name 仍是 `lynxtonapi-web`）。相比原版删掉了全部管理页（Channels、Users、Settings、Groups、AuditLogs、AdminBilling、Distribution、Setup、ModelPricing 等，62 个页面裁到 40 个），只保留客户能用到的功能。

**它的后端是 `lynxtonapi` 的 internal-user（`cmd/lynxtonapi-user`，本地 3002），不是本仓库的 `backend/`。** 判断依据：

- `web-user/vite.config.js` 代理 `/api` 与 `/v1` 到 `USER_API_DEV_PROXY_TARGET`，本仓库 `.env.local` 覆盖为 `http://localhost:3002`
- 请求 `/api/partner/me` 在 5173 上返回 404，证明它没有指向 3004
- `grep partner src` 的命中全部是首页「合作伙伴 logo」营销文案，没有任何功能性接口调用

生产环境同样走反向代理，不是直连：

- 一体化部署：`lynxtonapi/deploy/docker/nginx.user.conf` → `lynxtonapi-user-api:3000`
- 独立商户站点：`lynxtonapi/deploy/distribution/nginx.merchant-site.conf.template` → `${SITE_API_ORIGIN}`

### 站点身份是硬门槛

3002 上的登录类接口全部挂了 `siteauth.RequireSite()`，包括 `/api/lynx/auth/password-login`、`phone-login`、`email-login`、`phone-register` 等。请求必须带三个头：

```
X-Site-ID          e.g. site-local
X-Site-Host        e.g. localhost
X-Site-Credential  64 位小写十六进制
```

服务端取 `lc_distribution_merchants` 的 `site_id` / `site_domain` / `site_credential_hash` 做 sha256 常量时间比对，不匹配返回 403「站点身份无效」。

这些头**由代理在服务端注入，浏览器不接触**。`web-user/vite.config.js` 会先 `removeHeader` 清掉浏览器传来的同名头，再 `setHeader` 写入自己的值；变量名故意不加 `VITE_` 前缀，就是为了防止凭证被打进前端 bundle。

`web-user/.env.local` 需要四项一起给，缺一个都会在启动时报错：

```bash
USER_SITE_ID=site-local
USER_SITE_DOMAIN=localhost
USER_SITE_CREDENTIAL=<64 位 hex>
USER_API_DEV_PROXY_TARGET=http://localhost:3002
```

自运营站点（`merchant_code = self-operated`）允许登录 `has_own_web = false` 的商户用户。**这依赖 `lc_distribution_merchants.has_own_web` 列存在**，缺列会让所有登录直接失败——先跑 `lynxtonapi/migrations/versions/202611200001_distribution_merchant_has_own_web.up.sql`。

### 品牌数据源（容易误解）

`lc_distribution_merchants` 表上有 10 个 `brand_*` 列（`brand_name`、`brand_logo_url`、`brand_primary_color` 等），但**整个 `lynxtonapi` 仓库没有任何 Go 代码读取它们**，是预留未接线的字段。

3002 真正返回品牌数据的是 `internal-user/sitebranding` → `lc_site_footer` 表，而这张表是**全局单行**（`WHERE id = 1`），不按 merchant 过滤。也就是说当前所有站点看到的是同一套品牌，白标分层尚未真正生效。

## Docker 部署

伙伴平台自己的前后端容器及同域反向代理位于 [`deploy/`](deploy/README.md)，只包含 `backend/` 与 `web/`。从仓库构建，复制 `deploy/.env.example` 配置共享数据库与会话密钥，然后在该目录运行 Docker Compose；原平台的部署目录无需参与。

`web-user/` 不在 `deploy/compose.yml` 里，它由 `lynxtonapi` 的部署体系负责构建（`lynxtonapi/deploy/docker/Dockerfile.web-user`），本仓库里没有它的 Dockerfile。

## 本地运行

```bash
# 1. 伙伴后端（:3004）
cd backend
cp .env.example .env
# 编辑 .env，然后将变量导入当前 shell；Go 程序不会自动读取 .env
set -a; source .env; set +a
go run .

# 2. 伙伴后台前端（:5176）
cd web
npm install
npm run dev

# 3. 商户侧站点（:5173）—— 需要先起 lynxtonapi 的 user-api（:3002）
cd web-user
npm install
npm run dev
```

伙伴后端默认监听 `127.0.0.1:3004`。`SQL_DSN` 要连接原平台的同一数据库，且 `users`、`logs`、`lc_log_daily_summaries` 必须共库。`PARTNER_SESSION_SECRET` 必须至少 32 字符；如果想保留拆分前的登录会话，沿用原 admin 的 `PARTNER_SESSION_SECRET`。生产环境设置 `SESSION_COOKIE_SECURE=true` 并用 HTTPS 反代。`/healthz` 用于健康检查。

伙伴前端打开 `http://127.0.0.1:5176`。Vite 默认代理 `/api/partner` 和 `/api` 到 `127.0.0.1:3004`；其他地址用环境变量 `PARTNER_API_TARGET` 指定（注意不是 `VITE_` 前缀，这是构建期变量）。生产部署时，伙伴前端和伙伴 API 应在同一域名，反向代理 `/api/partner/` 到本服务，其他页面由前端静态服务提供。

前端 `.env` 里 `VITE_USE_MOCK` 默认为 `false`，即直接请求真实后端。只有当后端没起、只想看界面时才改成 `true`。

### 数据库迁移

伙伴后端**不自动迁移**。以下 SQL 需要先在原项目手工执行：

- `202611180001_distribution_merchants.up.sql` —— 商户表
- `202611190001_distribution_merchant_partner_login.up.sql` —— 伙伴登录字段
- `202611200001_distribution_merchant_has_own_web.up.sql` —— `has_own_web`，**web-user 登录依赖它**

平台管理员仍在 admin 后台开通伙伴登录、重置初始密码。

## 鉴权

伙伴后台用 **cookie session**，不是 Bearer token：

- 登录成功后服务端种 `HttpOnly` cookie（`lynxton_partner_session`），`Path=/api/partner`，`SameSite=Strict`
- axios 必须 `withCredentials: true`，否则跨源不带 cookie，表现是「密码输对了仍被踢回登录页」
- 前端 `localStorage` 只存一个 `'cookie-session'` 哨兵值表示「我登录过」，不存真凭证（cookie 是 HttpOnly，JS 读不到）
- 每次认证请求都从 `lc_distribution_merchants` 重读 `partner_login_enabled` 与 `partner_session_version`，改密码或禁用登录会立刻使旧会话失效
- 初始密码未改时 `PartnerReady()` 中间件对四个业务接口全返 403。前端靠 `/me` 返回的 `password_change_required` 强制跳设置页改密

## 接口现状

以 `backend/main.go` 的实际注册为准，**当前一共 9 条**：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 健康检查 |
| POST | `/api/partner/login` | 登录（限流） |
| POST | `/api/partner/logout` | 退出 |
| GET | `/api/partner/me` | 当前商户，仅 4 字段：`merchant_id` / `merchant_name` / `merchant_code` / `password_change_required` |
| POST | `/api/partner/password` | 改密（限流，是 POST 不是 PUT） |
| GET | `/api/partner/users` | 客户列表，7 字段（id/username/display_name/email/phone/status/created_time）；`page_size > 100` 会被回退成 20 |
| GET | `/api/partner/logs` | 调用日志，9 个筛选参数 |
| GET | `/api/partner/daily-trend` | 固定 14 个已完成日，**不含今天** |
| GET | `/api/partner/billing/summary` | 唯一聚合接口，默认本月 1 号到今天，最长 93 天 |

`web/src/shared/api/endpoints.ts` 是唯一的端点表，必须与 `main.go` 的注册一致。后端没实现的写成 `null`，请求层会抛 `ApiNotReadyError`（提示「接口尚未实现」），而不是打到一个不存在的 URL 上拿 404——404 会让人误以为路径拼错或服务没起。

**未实现（对应页面会提示接口未实现）**：

- 品牌白标 `/api/partner/brand`、`/brand/upload`、`/brand/domains`
  —— **全仓都不存在这个实现**。`lynxtonapi` 里能复用的只有 `internal/sitebranding`（全局单行站点品牌，不区分商户），商户级的 `brand_*` 列还没有任何读写接口。补这块需要先决定是读 `lc_site_footer` 还是启用商户 `brand_*` 列
- 客户写操作：新建、改额度、启停、重置密码（`/users` 只有 GET）
- 佣金、结算、提现
- 定价策略
- 邀请码
- 用量导出

概览页没有 `/overview` 接口，由前端用 `users`（取 total）+ `billing/summary` 拼出；佣金类字段不再显示，也不凭空编造比例。

## 易错点

- `/logs` 在既不传时间范围、也不传 `all_history=1` 时**默认只看今天**。页面语义是「不带时间条件 = 看全部」，所以 `fetchUsageLogs` 会显式补 `all_history=1`
- `/logs` 的 `all_history` **只接受空值或 `"1"`**，传 `"0"` 返回 400
- 日志 `type` 常量：`2` 消费、`5` 错误、`6` 退款、`7` 预扣、`8` 补扣。筛选必须用这 5 个原生 type，把「成功」映射成 `type=2` 会漏掉预扣(7)和补扣(8)
- **退款 `type=6` 在库里 `quota` 是正数**，后端 billing 用 `-logs.quota` 冲销。前端判断退款必须看 `type === 6`，不能用 `quota < 0`
- 净消耗口径 = `type IN (2,7,8)` 的 quota 之和 − `type=6` 的 quota 之和；`QuotaPerUnit = 500000`（1 元 = 50 万额度）
- 改密接口是 `POST` 不是 `PUT`，字段是 `current_password` 不是 `old_password`
- Vite alias 必须用数组 + 正则：`^@lynx\/shared\/(.*)$` 放前、`^@lynx\/shared$` 放后。用对象字面量会按 key 顺序把 `@lynx/shared/api/dealer` 拼成 `src/shared/index.ts/api/dealer`，报 `ENOTDIR`
- `lynxtonapi` 与 `partner` 的 `Merchant` 结构体已经开始分叉：前者有 `HasOwnWeb` 字段，后者没有。同步模型时注意

## 验证

```bash
cd backend && go test ./...
cd web && npm run typecheck && npm run build
```
