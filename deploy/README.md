# 伙伴平台 Docker 部署

本目录只部署 `~/partner` 的前端和后端。前端容器用 Nginx 提供静态页面，并把同域 `/api/partner/` 请求转发到后端容器；后端不映射宿主机端口。两个容器均连接原平台的共享数据库，后端不会自动建表。

## 准备

1. 确认原平台已手工执行商户表和伙伴登录迁移：`202611180001_distribution_merchants.up.sql`、`202611190001_distribution_merchant_partner_login.up.sql`。伙伴登录仍需在原 admin 后台为商户开通。
2. 在 `~/partner/deploy` 目录复制配置并填入实际数据库连接和会话密钥：

   ```bash
   cp .env.example .env
   chmod 600 .env
   # 编辑 .env；PARTNER_SESSION_SECRET 可用 openssl rand -hex 32 生成
   ```

   `SQL_DSN` 必须指向原平台的数据库，且 `users`、`logs`、`lc_log_daily_summaries` 在同一库。如果 PostgreSQL 在宿主机，容器中的 `127.0.0.1` 指向容器自身，请使用 `host.docker.internal`，并确保数据库监听 Docker 网关地址且允许该来源访问。若数据库在另一个 Compose 网络，需按实际网络接入并使用其容器 DNS 名称。

3. 确保本机已安装 Docker Engine 和 Docker Compose 插件。部署机可以从 `~/partner` 仓库直接构建，不依赖原 `lynxtonapi` 的部署目录。

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
