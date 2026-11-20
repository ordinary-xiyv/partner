# Lynxton Partner

独立伙伴后台项目。`backend/` 是仅提供 `/api/partner/*` 的 Go 服务，`web/` 是伙伴前端。与原平台共用数据库，不包含 admin 管理接口，也不自动迁移数据库。

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
bun install --frozen-lockfile
bun run dev
```

浏览器打开 `http://127.0.0.1:5176`。Vite 默认代理 `/api/partner` 到 `127.0.0.1:3004`；其他地址用 `PARTNER_API_TARGET` 指定。生产部署时，伙伴前端和伙伴 API 应在同一域名，反向代理 `/api/partner/` 到本服务，其他页面由前端静态服务提供。

## 接口与隔离

登录、首次改密、当前商户、退出登录、用户列表与搜索、调用日志、14 天趋势、账单汇总沿用原 `/api/partner/*` 路径。每次认证请求均从 `lc_distribution_merchants` 重新读取登录状态和会话版本；用户、日志、账单查询按会话商户 ID 限定。

管理员在原 admin 后台管理商户和重置伙伴密码；独立伙伴服务不暴露这些管理接口。原 admin 后端升级后不再注册 `/api/partner/*`，部署时需要把该路径切换到此服务。切换前确认新服务可启动并通过 `/healthz`、未登录 `/api/partner/me` 的 401 JSON 检查。

## 验证

```bash
cd backend && go test ./...
cd web && bun run build
```
