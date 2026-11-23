# 伙伴平台交接文档

> 面向：接手这个项目的人
> 读完这份应该能独立把项目跑起来、改代码、部署上线
> 最后更新：2026-11-23

---

## 一、这是什么

一套**白标（white-label）伙伴平台**。让平台方把 AI API 网关以"自己的品牌"转售给下游伙伴，每个伙伴有独立的站点、独立的客户、独立的文档，但共用同一套底层服务和数据。

三个角色：

| 角色 | 用什么 | 干什么 |
|---|---|---|
| 平台方（你） | 原 `lynxtonapi` 的 admin 后台 | 开通伙伴、分配站点身份、设初始密码 |
| 伙伴（你的客户） | 本仓库的 `web/`（伙伴后台） | 改自己站点的品牌、管自己的客户、写自己的文档 |
| 终端用户 | 本仓库的 `web-user/`（客户站） | 看伙伴品牌的首页、注册登录、用 API |

---

## 二、仓库结构 —— 最容易搞错的地方

```
partner/
├── backend/      伙伴平台自己的 Go 服务（端口 3004）
├── web/          伙伴后台前端（端口 5176）
├── web-user/     客户站前端（端口 5177）
├── deploy/       Docker 部署 + 上线 SQL
└── design/       设计稿
```

**关键认知：`web-user` 的后端不是本仓库的 `backend/`。**

| 前端 | 请求路径 | 打到哪个后端 |
|---|---|---|
| `web/`（伙伴后台） | `/api/partner/*` | 本仓库 `backend/` :3004 |
| `web-user/`（客户站） | `/api/partner/*` | 本仓库 `backend/` :3004 |
| `web-user/`（客户站） | `/api/*`、`/v1/*` | **`lynxtonapi` 的 user-api** :3002 |

也就是说 `web-user` 是**双后端分流**的。`backend/` 只提供 `/api/partner/*` 这 27 条接口，客户站真正的业务接口全在 `lynxtonapi` 里 —— `web-user/src/api/index.ts` 里引用了 **148 个不同的 `/api/*` 路径**（模型列表、充值、Token 管理、对话……），本仓库一个都不实现。

分工一句话：**`backend/` 只管"伙伴这个身份能配置什么"，`lynxtonapi` 管"这个站点能提供什么服务"。**

两个后端**共用同一个数据库**，`backend/` 没有独立库。

---

## 三、本地跑起来

### 前置条件

- Go 1.25+
- Node.js 18+
- 一个已经在用的 PostgreSQL（`lynxtonapi` 那个库）
- `lynxtonapi` 的 user-api 已经能跑（客户站要用）

### 1. 数据库

```bash
# 在 partner 仓库根目录
psql "$SQL_DSN" -v ON_ERROR_STOP=1 -f deploy/sql/001_partner_platform_schema.sql
```

这份脚本是幂等的，重复跑不会出错。详细内容见**第七节**。

### 2. 伙伴后端（:3004）

```bash
cd backend
cp .env.example .env
# 编辑 .env，至少要改 SQL_DSN 和 PARTNER_SESSION_SECRET
set -a; source .env; set +a     # Go 不会自动读 .env，必须导入 shell
go run .
```

必需的环境变量：

| 变量 | 说明 |
|---|---|
| `SQL_DSN` | 必填。`postgres://user:pass@host:5432/lynxtonapi` |
| `PARTNER_SESSION_SECRET` | 必填，**至少 32 字符**，不够会直接 fatal |
| `PARTNER_LISTEN_ADDRESS` | 默认 `127.0.0.1:3004` |
| `SESSION_COOKIE_SECURE` | 本地 `false`，生产 `true`（走 HTTPS 时必须） |

验证：`curl http://127.0.0.1:3004/healthz` → `{"ok":true}`

### 3. 伙伴后台（:5176）

```bash
cd web
npm install
npm run dev
```

默认代理 `/api/partner` 和 `/api` 到 `127.0.0.1:3004`。要连别的环境时用 `PARTNER_API_TARGET` 覆盖（**没有 `VITE_` 前缀**，这是构建期变量，改完要重启）。

打开 http://127.0.0.1:5176

### 4. 客户站（:5177）

```bash
cd web-user
npm install
cp .env.example .env.local
# 编辑 .env.local，四项必须一起给
npm run dev
```

`.env.local` 必填五项，缺一个启动就报错：

```bash
USER_SITE_ID=site-local
USER_SITE_DOMAIN=localhost
USER_SITE_CREDENTIAL=<64 位小写十六进制>
USER_API_DEV_PROXY_TARGET=http://localhost:3002      # lynxtonapi user-api
USER_PARTNER_PROXY_TARGET=http://127.0.0.1:3004     # 本仓库 backend
```

> ⚠️ **端口是 5177 不是 5173。** `web-user/vite.config.js` 里开了 `strictPort: true`，端口被占会直接报错而不是自动换到下一个。这是刻意的 —— 客户站的站点身份是按端口区分环境的，端口被悄悄换掉会导致你验证半天发现验的不是这个环境。

**三条启动期硬校验**（`vite.config.js` 顶部，不满足直接 `throw`，Vite 起不来）：

1. `USER_SITE_ID` / `USER_SITE_DOMAIN` / `USER_SITE_CREDENTIAL` **必须同时给或同时不给**，给一两个就报 `requires ... together`
2. 格式校验：`USER_SITE_ID` 匹配 `^[a-z0-9][a-z0-9_-]{0,63}$`；`USER_SITE_DOMAIN` 是合法域名；`USER_SITE_CREDENTIAL` 必须是 **64 位小写 hex**（大写会被拒）
3. 用站点代理时 `VITE_API_URL` **必须留空**，否则报 `must be empty when using the Vite site proxy`

**`USER_SITE_CREDENTIAL` 是干什么的**：客户站所有登录类接口都挂了站点身份校验，请求必须带三个头：

```
X-Site-ID          site-local
X-Site-Host        localhost
X-Site-Credential  64 位 hex
```

服务端拿它和 `lc_distribution_merchants.site_credential_hash`（SHA-256）做常量时间比对，不匹配返回 403「站点身份无效」。

这三个头**由代理在服务端注入，浏览器永远接触不到**。`web-user/vite.config.js` 会先 `removeHeader` 清掉浏览器传来的同名头，再写自己的值。变量名故意不加 `VITE_` 前缀，防止凭证被打进前端 bundle。

两个 target 上注入逻辑是共用的（`withSiteHeaders`），因为 `/api/partner/public/site-brand` 也靠这三个头查商户品牌 —— 只挂在 `/api` 那一条上会导致品牌读不到。

---

## 四、数据模型 —— 一张表撑起半个系统

### `lc_distribution_merchants`

整个白标体系的核心表。"伙伴"和"经销商"在数据模型上是同一个东西，都是这张表的一条记录。

分组看这几块字段：

**身份与站点绑定**
| 列 | 说明 |
|---|---|
| `id` | 主键 |
| `merchant_name` / `merchant_code` | 商户名、唯一编码。自运营平台固定 `self-operated` |
| `site_id` / `site_domain` / `site_credential_hash` | 站点三件套，**要么全空要么全填**（有 CHECK 约束）|
| `site_credential_rotated_at` / `site_last_seen_at` | 凭证轮换时间、最后访问时间 |
| `has_own_web` | 商户有没有自己的独立站点。`false` 时其用户可在自运营站点登录 |

**伙伴后台登录**（与站点凭证完全独立，两套东西）
| 列 | 说明 |
|---|---|
| `partner_password_hash` | bcrypt 哈希，永不返回前端 |
| `partner_login_enabled` | 是否已开通伙伴后台 |
| `partner_password_change_required` | 首次登录/重置后强制改密 |
| `partner_session_version` | 改密或禁用时递增，让旧会话立刻失效 |

**品牌白标**（10 个 `brand_*` 列）
| 列 | 说明 |
|---|---|
| `brand_name` / `brand_short_name` | 站名、简称（简称上限 8 字符，窄屏用）|
| `brand_logo_url` / `brand_favicon_url` | 图片地址（对象存储公网 URL）|
| `brand_primary_color` | 主色，**有 CHECK 约束，只接受 `#RGB` 或 `#RRGGBB`** |
| `brand_page_title` / `brand_tagline` | 浏览器标题、标语 |
| `brand_api_base_url` | 客户站代码示例里显示的接口地址 |
| `brand_support` | 客服信息，`jsonb`，必须是 object |
| `brand_landing` | 首页配置，`jsonb`，必须是 object |

`brand_landing` 里目前有两个键：

```json
{
  "layout_style": "editorial",   // editorial（纸感编辑）| terminal（终端网格）
  "footer": { "enabled": true }  // 页脚显示开关
}
```

`brand_support` 存客服信息：

```json
{
  "phone":  "19931285107",
  "email":  "xxx@example.com",
  "wechat": "微信号",
  "note":   "工作日 9:00 - 21:00"
}
```

> ⚠️ **`layout_style` 必须整体提交。** 后端对 `brand_landing` 是**整体替换**而不是深合并 —— 为了让"删掉第 N 条卖点"这种操作不会复活。所以前端改任何一个键，都要把整个 `brand_landing` 展开再改。

### 其他表

| 表 | 谁在用 | 说明 |
|---|---|---|
| `users` | 双方 | 主站用户表。加了 `merchant_id` 归属到商户 |
| `logs` | 双方 | 调用日志。伙伴后台的用量、计费全从这算 |
| `options` | backend 只读 | 对象存储配置，键前缀 `object_storage_setting.` |
| `lc_partner_doc_categories` | backend 读写 | 各站点自己的文档分类 |
| `lc_partner_doc_articles` | backend 读写 | 各站点自己的文档正文 |
| `lc_site_footer` | lynxtonapi 读写 | 全局单行的站点页脚（不按商户分）|

**为什么文档不复用主站的 `lc_doc_*` 表**：那两张表的 `slug` 是全局唯一索引，A 站建了 `getting-started`，B 站就建不了。改成 `(site_id, slug)` 联合唯一等于要动主站库结构，所以另起了一套按站点隔离的表。

---

## 五、后端接口清单

`backend/` 一共 **27 条**路由（以 `backend/main.go` 的实际注册为准），分三组鉴权：

**公开（不需要登录，靠 IP 限流）**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 健康检查 |
| POST | `/api/partner/login` | 登录（每 IP 每分钟 10 次）|
| POST | `/api/partner/logout` | 退出 |

**需要登录（cookie session）**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/partner/me` | 当前商户，4 字段 |
| POST | `/api/partner/password` | 改密。**是 POST 不是 PUT**，字段是 `current_password` 不是 `old_password` |

**需要登录 + 已改初始密码**（`PartnerReady` 中间件，初始密码未改时这组全返 403）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/partner/users` | 客户列表。`page_size > 100` 会被回退成 20 |
| GET | `/api/partner/logs` | 调用日志，9 个筛选参数 |
| GET | `/api/partner/daily-trend` | 固定 14 个已完成日，**不含今天** |
| GET | `/api/partner/billing/summary` | 唯一聚合接口，默认本月 1 号到今天，最长 93 天 |
| GET/PUT | `/api/partner/brand` | 品牌配置读写 |
| GET | `/api/partner/brand/domains` | 可绑定域名列表 |
| POST | `/api/partner/brand/domains/:host/check` | 域名可用性检查 |
| POST | `/api/partner/brand/upload` | 品牌图片上传（multipart）|
| GET/POST/PUT/DELETE | `/api/partner/docs/*` | 文档中心管理侧，共 9 条 |

**公开（靠站点身份头，不需要 cookie）**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/partner/public/site-brand` | 客户站读品牌配置 |
| GET | `/api/partner/public/docs/tree` | 客户站读文档树 |
| GET | `/api/partner/public/docs/articles/:slug` | 客户站读文档正文 |

### 鉴权机制（和常见做法不一样，容易踩）

伙伴后台用的是 **cookie session，不是 Bearer token**：

- 登录成功后种 `HttpOnly` cookie：`lynxton_partner_session`，`Path=/api/partner`，`SameSite=Strict`
- axios 必须 `withCredentials: true`，否则跨源不带 cookie，表现是"密码输对了还是被踢回登录页"
- 前端 localStorage 只存一个 `'cookie-session'` 哨兵值表示"我登录过"，**不存真凭证**
- 每次认证请求都从库里重读 `partner_login_enabled` 和 `partner_session_version`，改密码或禁用登录会**立刻**使旧会话失效

---

## 六、前端结构

### 伙伴后台 `web/`（端口 5176）

路由定义在 `web/src/App.tsx`，除登录页外共 6 个菜单页 + 1 个详情页：

| 路由 | 页面 | 内容 |
|---|---|---|
| `/login` | 登录 | 不在菜单里，未登录时唯一可达 |
| `/overview` | 数据概览 | 由 users + billing 拼出，没有专门的 overview 接口 |
| `/customers` | 我的客户 | 列表 |
| `/customers/:id` | 客户详情 | 不在菜单里，从列表点进去 |
| `/usage` | 用量明细 | 日志筛选 |
| `/brand` | 品牌设置 | 品牌信息、主色、首页风格、页脚、域名 |
| `/docs` | 文档设置 | 文档分类/文章的增删改 |
| `/settings` | 账号设置 | 改密码 |

`/` 和未匹配路径都重定向到 `/overview`。

`web/src/shared/api/endpoints.ts` 是**唯一的端点表**，必须和后端 `backend/main.go` 一致。后端没实现的写成 `null`，请求层会抛 `ApiNotReadyError`（提示"接口尚未实现"），不会打到一个不存在的 URL 拿 404 —— 404 会让人误以为路径拼错或服务没起。

### 客户站 `web-user/`（端口 5177）

它是 `lynxtonapi/web` 的商户侧裁剪版（`web-user/package.json` 的 name 还是 `lynxtonapi-web`）。删掉了全部管理页（Channels、Users、Settings、Groups、AuditLogs、AdminBilling、Distribution、Setup、ModelPricing 等），只保留客户能用到的功能。

页面数量口径（供比对）：原版 `src/pages/` 下 113 个 `.tsx`、12 个目录；`web-user` 是 50 个 `.tsx`、9 个目录。删掉的四个目录是 `settings` / `home` / `home-alt` / `admin`，同时新增了一个 `home-style/`（手写首页，替代原 `home`）。

**首页有两套风格**，按伙伴配置切换：

| 风格 | 特征 | 文件 |
|---|---|---|
| `editorial` | 纸感编辑，米白底、衬线标题、浅底代码"引文" | `pages/home-style/editorial/` |
| `terminal` | 终端网格，深底、等宽字体、终端窗口式代码块 | `pages/home-style/terminal/` |

入口是 `web-user/src/pages/HomePageGate.tsx`，按风格 lazy 加载。两套共用同一份 i18n 文案和同一批 shared hooks。

风格优先级：**伙伴配置（`brand_landing.layout_style`）> 平台配置 > 默认 `editorial`**。

**两套风格没有共享包**：`web` 用 `@lynx/shared` 别名，`web-user` 只有 `@/*`。风格常量故意各写一份（`web/src/shared/lib/homeStyle.ts` 和 `web-user/src/config/homeStyle.ts`），因为它们是独立构建产物，为一个字符串常量建包会让两边都被迫跟着对方的构建配置走。**但两边的约定必须一致：未知值一律归到 `editorial`**，否则会出现"后台显示 A、客户站渲染 B"。

---

## 七、上线 SQL

全部汇总在 `deploy/sql/001_partner_platform_schema.sql`（400 行，7 段，**全段幂等**）。

```bash
psql "$SQL_DSN" -v ON_ERROR_STOP=1 -f deploy/sql/001_partner_platform_schema.sql
```

| 段 | 内容 | 缺了会怎样 |
|---|---|---|
| 0 | 前置只读检查 | —— |
| 1 | `lc_distribution_merchants` + `users.merchant_id` | 伙伴后台登不进去 |
| 2 | 伙伴登录 5 列 | `has_own_web` 缺失 → **客户站所有登录全挂** |
| 3 | 10 个 `brand_*` 列 | 品牌设置页 500（`column "brand_name" does not exist`）|
| 4 | 3 条 CHECK 约束 | 非法主色、非对象 JSON 能写进库 |
| 5 | `lc_partner_doc_*` 两张表 | 文档中心全部接口报"未初始化"|
| 6 | 只读依赖清单 | 不用执行，只是完整清单 |
| 7 | 上线后自检 | 逐项确认是否就位 |

### ★ 第 3、4 段必须特别注意

那 10 个 `brand_*` 列和 3 条 CHECK 约束，**在 `lynxtonapi/migrations/versions/` 里没有对应的版本化迁移**。

现有环境是开发过程中手工加到库上的。`grep brand_primary_color *.sql` 在整个 migrations 目录命中 0 次。

**上线到新库时必须单独执行这两段**，不要指望跑原平台的迁移脚本能带出来。否则品牌功能上线即 500。

### 第 5 段可以交给 AutoMigrate

后端启动时会自动 `AutoMigrate` 文档表兜底（见 `backend/internal/partner/doc_tables.go`）。但生产环境的应用账号通常没有 DDL 权限，所以**还是建议预先执行**。AutoMigrate 失败不会阻断启动，只在日志里打一行警告。

### 自检

跑完再执行一次同一个文件，第 7 段会逐项输出 `has_column = t/f`，任何 `f` 都要回去补对应段落。

---

## 八、部署

### Docker（推荐）

```bash
cd deploy
cp .env.example .env
chmod 600 .env
# 编辑 .env
docker compose --env-file .env -f compose.yml config --quiet    # 先校验
docker compose --env-file .env -f compose.yml up -d --build
docker compose --env-file .env -f compose.yml ps
curl -i http://127.0.0.1:8081/healthz
```

`deploy/compose.yml` 只包含 `backend/` 和 `web/`（伙伴后端 + 伙伴后台）。**`web-user/` 不在里面** —— 它由 `lynxtonapi` 的部署体系构建（`lynxtonapi/deploy/docker/Dockerfile.web-user`），本仓库没有它的 Dockerfile。

生产环境要求：
- 同机 Nginx/Caddy 终止 HTTPS，反代到 `127.0.0.1:8081`
- 前端和 `/api/partner/` **必须同域**，否则 cookie 的 `SameSite=Strict` 会失效
- `SESSION_COOKIE_SECURE=true`

### 默认端口汇总

| 服务 | 端口 | 归属 |
|---|---|---|
| 伙伴后端 | 3004 | 本仓库 |
| 伙伴后台 | 5176 | 本仓库 |
| 客户站 | 5177 | 本仓库 |
| lynxtonapi user-api | 3002 | **另一个仓库** |
| Docker 反代 | 8081 | 本仓库 |

---

## 九、容易踩的坑

### 数据口径

- `/logs` 在既不传时间范围也不传 `all_history=1` 时**默认只看今天**（今天按 `Asia/Shanghai` 固定时区算，不受服务器时区影响）。页面语义是"不带时间条件 = 看全部"，所以 `fetchUsageLogs` 会显式补 `all_history=1`
- `/logs` 的 `all_history` **只接受空值或 `"1"`**，传 `"0"` 返回 400
- 日志 `type` 常量：`2` 消费、`5` 错误、`6` 退款、`7` 预扣、`8` 补扣。筛选必须用这 5 个原生值，**把"成功"映射成 `type=2` 会漏掉预扣(7)和补扣(8)**
- **退款 `type=6` 在库里 `quota` 是正数**，后端 billing 用 `-logs.quota` 冲销。前端判断退款必须看 `type === 6`，**不能用 `quota < 0`**
- 净消耗 = `type IN (2,7,8)` 的 quota 之和 − `type=6` 的 quota 之和
- `QuotaPerUnit = 500000`（1 元 = 50 万额度）

### 前端

- **Vite 的 proxy 前缀匹配按声明顺序**。`web-user/vite.config.js` 里 `'/api/partner'` 必须写在 `'/api'` 前面，反了会让 `/api/partner/*` 被 `/api` 吞掉、转发到 3002，表现是「伙伴接口全 404」。而且 404 的响应体是门 HTML 页面而不是 JSON，排查时特别容易跑偏
- Vite alias 必须用数组 + 正则，`^@lynx/shared/(.*)$` 放前、`^@lynx/shared$` 放后。用对象字面量会按 key 顺序把 `@lynx/shared/api/dealer` 拼成 `src/shared/index.ts/api/dealer`，报 `ENOTDIR`
- `web` 的 axios 实例用的是 **XMLHttpRequest** 不是 fetch，要拦请求得改 XHR 原型
- axios 响应拦截器里 401 会触发 `onUnauthorized` → `window.location.replace('/login')`，**任何接口 401 都会被踢**，不只是 `/me`
- `web-user` 没有 `@lynx/shared` 包，只有 `@/*`

### 对象存储

品牌图片上传走的是**本服务中转**，不是浏览器直传。原因是共用的那个 bucket 没开 CORS，跨域 PUT 会在预检阶段被拦。配置从 `options` 表读，键前缀 `object_storage_setting.`，复用平台已经配好的那套。

### GSAP 动效（首页）

四条硬规则，违反任何一条都会导致内容看不见：

1. 一律 `fromTo` 不用 `from`
2. 终态必须与 CSS 默认样式一致
3. 尊重 `prefers-reduced-motion`
4. **绝不因为动效没跑完就让内容不可见**

### 部署相关（上线后才发现就晚了）

- **登录限流按容器 IP 算，不是真实客户端 IP。** `backend/main.go` 里 `r.SetTrustedProxies(nil)` 关掉了代理信任，此时 Gin 的 `c.ClientIP()` **只返回 `RemoteAddr`**，不读 `X-Forwarded-For`。`web/nginx.conf` 虽然设了 `X-Real-IP` / `X-Forwarded-For`，后端也不采信。

  实测（`httptest` 构造 `RemoteAddr=172.18.0.5:54321` + `X-Forwarded-For=203.0.113.9`）结果：
  ```
  ClientIP="172.18.0.5"
  ```

  后果：所有伙伴的登录请求在容器看来都来自同一个 IP，共享 `10 次/分钟` 的限流额度。人少时无感，一旦同时在线超过 10 个伙伴同时在登录/改密，就会有人被 429 挡住。

  要修的话有两条路：① 把 `SetTrustedProxies` 改成只信任内网网段（如 `127.0.0.1` + `172.16.0.0/12`），让 `X-Forwarded-For` 生效；② 把限流换成按 `merchant_code` / 用户名计数。**改之前先确认前置 nginx 有没有正确覆盖 `X-Forwarded-For`**，否则伪造头就能绕过限流。

---

## 十、验证清单

改完代码提交前跑这些：

```bash
# 后端
cd backend
go build ./...
go vet ./...
go test ./...

# 伙伴后台
cd web
npm run typecheck     # 必须 0 错误
npm run build

# 客户站
cd web-user
npm run typecheck     # 当前基线 39 条（历史遗留），零新增即可
npm run build
```

> `web-user` 的 39 条 tsc 错误是历史遗留，不是本次引入的。判断标准是**零新增**，不要试图一次清完，那会牵扯大量业务代码。

---

## 十一、还需要做什么（已知未完成）

**功能缺口（后端接口没有，前端页面上会有提示）**：

- **客户写操作**：新建客户、改额度、启停、重置密码 —— `/users` 只有 GET
- **佣金、结算、提现** —— 概览页刻意不显示，因为后端不返回这些字段，凭空编造比例会误导伙伴
- **定价策略、邀请码、用量导出** —— 未实现

概览页的"累计消费"等数字由前端用 `users`（取 total）+ `billing/summary` 拼出，没有 `/overview` 接口。

**架构性缺口（不是漏做，是设计上还没打通）**：

- **白标分层在 `lynxtonapi` 侧没生效**。本仓库的 `backend/` 把品牌写进 `lc_distribution_merchants.brand_*`，客户站首页读 `/api/partner/public/site-brand` 能拿到；但走 3002 的原生页面读的是 `lc_site_footer`（全局单行），所有站点看到同一套。要让品牌真正贯穿到登录页、对话页、文档页，得改 `lynxtonapi` 的 `internal-user/sitebranding` 去按站点身份读 `brand_*`

**运维隐患**：

- **登录限流按容器 IP 计数**，多伙伴并发登录会互相挤占额度。详见第九节「部署相关」

---

## 十二、找人问什么

| 问题 | 找谁 / 看哪里 |
|---|---|
| 伙伴怎么开通、初始密码怎么给 | 平台 admin 后台（`lynxtonapi` 的 admin）|
| 客户站的业务接口为什么不响应 | `lynxtonapi` 仓库，不是本仓库 |
| 站点身份 403 | 检查 `lc_distribution_merchants` 的 `site_id`/`site_domain`/`site_credential_hash` 三件套是否齐全，以及代理有没有注入三个头 |
| 品牌改了客户站没变化 | 检查 `brand_api_base_url` 是不是填了 `localhost` 这类本机地址（它的优先级最高，会让所有客户站的代码示例都显示 localhost）|
