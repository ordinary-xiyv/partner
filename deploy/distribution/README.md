# 商户客户站 Docker 部署

本目录部署 `~/partner/web-user` 的客户站，不部署伙伴后台。每个站点使用一个独立 Compose 项目；同一份镜像可以复用，站点 ID、域名与凭证在运行时注入。部署文件只依赖本仓库目录，不引用 `lynxtonapi/deploy`。

## 准备

1. 在原平台 admin 的商户管理中绑定站点 ID、域名并保存一次性部署凭证。后端须已执行商户表和 `has_own_web` 的手工 SQL。
2. 在本目录执行 `cp .env.example .env` 并设置文件权限为 `chmod 600 .env`。把 admin 一次性显示的 64 位小写十六进制部署凭证直接填入 `SITE_CREDENTIAL`，再填写 `SITE_PROJECT_NAME`、`SITE_ID`、`SITE_DOMAIN`、`SITE_API_ORIGIN` 和 `SITE_PARTNER_API_ORIGIN`。`.env` 已被 Git 忽略，不要把它放进前端构建环境或提交到仓库。
3. 站点 ID、域名须与 admin 绑定值一致。`SITE_API_ORIGIN` 指向共享 user API，`SITE_PARTNER_API_ORIGIN` 指向伙伴后端；两者不能填同一个服务，不要在后面加路径或 `/`。生产环境两者都应是受信证书的 HTTPS 域名；无域名的内网部署见「访问与检查」末尾的内网上游说明。
4. 确保用户浏览器最终通过该站点域名的 HTTPS 访问。宿主机 Nginx/Caddy 可终止 TLS，再将原始 `Host` 转发至 `127.0.0.1:SITE_HTTP_PORT`。构建时 `VITE_API_URL` 固定为空，浏览器只访问同域路径。

## 打包镜像

在有源码和 Docker 的构建机器上，从 `~/partner/deploy/distribution` 执行：

```bash
./package-image.sh 2026.11.23
```

脚本以本仓库的 `web-user/` 为构建上下文，执行 Bun 安装和 Vite 构建，生成 `lynxton-partner-web-user:2026.11.23` 与 `lynxton-partner-web-user:latest` 两个标签，并导出 `dist/lynxton-partner-web-user-2026.11.23.tar.gz`。`dist/` 被 Git 忽略。国内模式可用 `VITE_DEPLOY_MODE=domestic ./package-image.sh 2026.11.23`；不传时为 `overseas`。站点身份和凭证仅在容器启动时注入，不进入镜像。

异机部署时，把 tar.gz 和本目录的 Compose、Nginx 模板、启动脚本复制到目标机器，然后导入镜像：

```bash
docker load -i dist/lynxton-partner-web-user-2026.11.23.tar.gz
```

若使用镜像仓库，打包时第二个参数填写完整镜像名（不含标签），例如 `./package-image.sh 2026.11.23 registry.example.com/team/partner-web-user`；再分别 `docker push` 版本标签和 `latest`，部署环境把 `SITE_IMAGE_NAME` 设为该镜像名。生产站点建议把 `SITE_IMAGE_TAG` 固定为已发布的版本号，避免不同站点在不同时刻拉到不同的 `latest`。

## 启动

在 `~/partner/deploy/distribution` 目录执行：

```bash
docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml up -d --pull never
docker compose --env-file .env -f compose.yml ps
```

启动前确保目标机器已通过 `docker load` 或 `docker pull` 拿到 `SITE_IMAGE_NAME:SITE_IMAGE_TAG`。更新前先打包或拉取新版本，再修改 `.env` 的 `SITE_IMAGE_TAG` 并重复 `up -d --pull never`。多站点可共用同一镜像，各站点使用不同的环境文件、`SITE_PROJECT_NAME`、`SITE_DOMAIN`、`SITE_HTTP_PORT` 和 `SITE_CREDENTIAL`。凭证会出现在 Compose 解析结果和容器环境中，排查时不要分享这些输出。

站点代理仅将 `/api/partner/public/` 转给伙伴后端，供匿名页面读取商户品牌与文档；伙伴后台的登录、管理接口在客户站域名返回 404。其他 `/api/`、`/v1/` 等请求转给共享 user API。两个上游请求都由站点 Nginx 覆盖并注入 `X-Site-ID`、`X-Site-Host`、`X-Site-Credential`；浏览器不会得到凭证。伙伴后端的公开接口需要已部署并与 user API 共用商户表及凭证哈希。

## 访问与检查

默认只绑定宿主机 `127.0.0.1:8080`。本机可用域名请求检查代理：

```bash
curl -i -H 'Host: site.example.com' http://127.0.0.1:8080/healthz
docker compose --env-file .env -f compose.yml logs -f web-user
```

把 `site.example.com` 和端口换成实际值。`/healthz` 只证明本站点容器存活；登录与商户品牌还需分别检查 user API 和伙伴后端的真实请求。正式访问需要在宿主机配置 TLS 反向代理，例如：

```nginx
server {
    listen 443 ssl;
    server_name site.example.com;
    ssl_certificate /path/to/site.crt;
    ssl_certificate_key /path/to/site.key;
    location / {
        proxy_set_header Host $host;
        proxy_pass http://127.0.0.1:8080;
    }
}
```

容器会校验两个上游的 TLS 证书。若只在同一宿主机联调，可把上游写为 `http://host.docker.internal:<端口>` 并设置 `SITE_ALLOW_INSECURE_HTTP=true`；相应后端须监听 Docker 网关可访问的地址，单独监听 `127.0.0.1` 不够。联调时若用 `localhost` 直接打开页面，还需设置 `SITE_ENFORCE_HOST=false`；远程浏览器通过 HTTP IP 访问可能无法使用密码登录所需的 `crypto.subtle`，请用本机端口转发或 HTTPS。

上游在可信内网、没有域名时（例如后端在另一台内网机器上），可把上游写为 `http://<内网IPv4>(:<端口>)` 并设置 `SITE_ALLOW_INTRANET_HTTP=true`。注意 `X-Site-Credential` 会以明文随请求发往 HTTP 上游，只在网络路径完全可信时使用；跨不可信网络的部署必须回到 HTTPS 域名。
