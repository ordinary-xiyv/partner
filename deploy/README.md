# 伙伴平台 Docker 部署

本目录只部署 `~/partner` 的前端和后端。前端容器用 Nginx 提供静态页面，并把同域 `/api/partner/` 请求转发到后端容器；后端不映射宿主机端口。两个容器均连接原平台的共享数据库，后端不会自动建表。

## 准备

1. **先跑数据库脚本。** 本目录的 `sql/001_partner_platform_schema.sql` 汇总了上线所需的全部 DDL，按顺序执行即可，重复执行安全（全段幂等）：

   ```bash
   psql "$SQL_DSN" -v ON_ERROR_STOP=1 -f sql/001_partner_platform_schema.sql
   ```

   它覆盖 6 类东西，缺任何一段都会以「500 / 列不存在」的形式暴露在业务接口里：

   | 段 | 内容 | 缺了会怎样 |
   |---|---|---|
   | 1 | `lc_distribution_merchants` 表 + `users.merchant_id` | 伙伴后台登不进去 |
   | 2 | `partner_password_hash` 等 5 列 | 伙伴登录失败；`has_own_web` 缺失 → **客户站所有登录全挂** |
   | 3 | 10 个 `brand_*` 列 | 品牌设置页 500（`column "brand_name" does not exist`）|
   | 4 | 3 条 CHECK 约束 | 非法主色 / 非对象 JSON 能被写进库 |
   | 5 | `lc_partner_doc_*` 两张表 | 文档中心全部接口报「文档功能未初始化」|
   | 6 | 只读依赖清单（`users` / `logs` / `options`）| —— 由 lynxtonapi 维护，本仓库不建 |

   ★ **第 3 段要特别注意**：这 10 个 `brand_*` 列在 `lynxtonapi` 的 migrations 目录里**没有对应的版本化迁移**，现有环境是开发过程中手工加到库上的。上线到新库时必须执行，不能指望原平台迁移脚本带到。

   跑完脚本后，`sql/001_partner_platform_schema.sql` 第 7 段是只读自检，用同一份文件再执行一次就能看到每一项是否就位。

2. 伙伴登录仍需在原 admin 后台为商户开通（`partner_login_enabled`），并设置初始密码。首次登录会强制改密。
2. 在 `~/partner/deploy` 目录复制配置并填入实际数据库连接和会话密钥：

   ```bash
   cp .env.example .env
   chmod 600 .env
   # 编辑 .env；PARTNER_SESSION_SECRET 可用 openssl rand -hex 32 生成
   ```

   `SQL_DSN` 必须指向原平台的数据库，且 `users`、`logs`、`lc_log_daily_summaries` 在同一库。如果 PostgreSQL 在宿主机，容器中的 `127.0.0.1` 指向容器自身，请使用 `host.docker.internal`，并确保数据库监听 Docker 网关地址且允许该来源访问。若数据库在另一个 Compose 网络，需按实际网络接入并使用其容器 DNS 名称。

3. 确保本机已安装 Docker Engine 和 Docker Compose 插件。部署机可以从 `~/partner` 仓库直接构建，不依赖原 `lynxtonapi` 的部署目录。

### 两个后端、一张表

上线时容易搞混的一点：**伙伴平台和客户站用的不是同一个后端，但读的是同一张商户表。**

| 服务 | 端口 | 数据库 | 谁在访问 |
|---|---|---|---|
| 伙伴后端（`backend/`）| 3004 | 与 lynxtonapi 共用 | 伙伴后台 `web/`（5176）+ 客户站 `web-user/`（5177）读 `/api/partner/public/*` |
| lynxtonapi user-api（`cmd/lynxtonapi-user`）| 3002 | 同上 | 客户站全部业务接口 `/api/*`、`/v1/*` |

`web-user` 是双后端分流：`/api/partner/*` → 3004，其余 `/api/*` → 3002。这个顺序在 `web-user/vite.config.js` 里是**强制的** —— `/api/partner` 必须声明在 `/api` 前面，否则会被前缀通配吞掉。生产环境在 nginx 里做等价分流。

`lc_distribution_merchants` 是两边共用的唯一数据源：伙伴后台写 `brand_*`，客户站按站点身份（`X-Site-ID` / `X-Site-Host` / `X-Site-Credential` 三个头）读回同一份。不各存一套，也不做同步。

## 启动

在 `~/partner/deploy` 中执行：

```bash
docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml up -d --build
docker compose --env-file .env -f compose.yml ps
curl -i http://127.0.0.1:8081/healthz
```

`PARTNER_BIND_ADDRESS` 默认 `127.0.0.1`，`PARTNER_HTTP_PORT` 默认 `8081`；浏览器直连该端口只能用于本机验证。生产环境在同机 Nginx 或 Caddy 上配置 HTTPS 域名，并把整个站点反代到 `http://127.0.0.1:8081`。TLS 入口需要传递 `Host` 和 `X-Forwarded-Proto`；前端与 `/api/partner/` 必须保持同域，登录 Cookie 的 `Secure` 标记已开启。完成反代后，用实际 HTTPS 域名打开伙伴平台并登录。

## 更新与排查

拉取伙伴仓库新代码后，在本目录重新执行 `docker compose --env-file .env -f compose.yml up -d --build`。查看日志：

```bash
docker compose --env-file .env -f compose.yml logs -f backend web
```

`/healthz` 仅说明前端 Nginx 在运行。后端容器的健康检查会访问它自己的 `/healthz`，并在启动时连接数据库；前端容器在后端健康后启动。若页面可打开但登录失败，先检查后端日志、数据库连接、伙伴账号是否开通，以及浏览器是否通过 HTTPS 域名访问。
