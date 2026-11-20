# Seedance 2.0 真人人像（活体认证 + 素材库 + 视频）

真人人像 = **H5 活体认证** → **取得真人组 id** → **import 同人素材** → **Seedance 生成视频**。

AIGC 虚拟人见 **模型指南 → Seedance 2.0 虚拟人**。

---

## 整体流程

```text
① POST liveness/sessions              创建 H5 认证
② 真人打开 h5_url（约 120 秒内）
③ GET session 直至 status=succeeded   platform 模式无需 complete
④ 取真人组 id（见下文「id 从哪来」）
⑤ POST import，Body.id = 真人组 id    登记同人素材
⑥ POST /v1/videos（asset_ref）       生成视频
```

Base URL：`https://tokens.lynxtoncloud.com`  
鉴权：`Authorization: Bearer sk-...`

---

## 关于字段 `id`（易混，必读）

| 场景 | `id` 指什么 | 从哪来 |
|------|-------------|--------|
| 活体会话成功后的 **data.id** | **真人组 id** | `GET .../sessions/{session_id}` 在 `status=succeeded` 时返回 |
| **GET /face-groups** 的 **items[].id** | **真人组 id** | 列出/查询真人组 |
| import **Body.id** | **真人组 id**（必填） | 用上两行取得的 id；组须 `status=verified` |
| import 响应 **data.id** | **素材记录 id** | 管理素材用，不是组 id |
| GET 列表 Query **id** | 按真人组筛选 | 填真人组 id |

> 当前 API **没有** `face_group_id` / `group_id` 请求字段；请统一使用 **`id`**。

---

## 两种回调模式

| 模式 | 创建会话 | H5 结束后 | 是否调 complete |
|------|----------|-----------|-----------------|
| **platform**（默认） | 不传 `callback_url` | 平台自动处理 | **不需要**；轮询 GET session 或 `webhook_url` |
| **client** | 传 https `callback_url` | 浏览器跳到您的地址 | **需要** POST complete |

响应 `callback_mode`：`platform` / `client`。

### 模式 A：平台托管（推荐）

```text
① POST liveness/sessions（不传 callback_url）
② 真人打开 h5_url
③ GET session 直至 status=succeeded → 记录 data.id（真人组 id）
④ POST import，Body: { "id": "<真人组id>", "url": "..." }
⑤ POST /v1/videos
```

### 模式 B：自建回调

```text
① POST liveness/sessions，callback_url=https://your-app.com/callback
② 真人完成 H5 → 火山跳转 callback_url（Query 含 bytedToken、resultCode 等）
③ POST .../sessions/{session_id}/complete
     Body: { "byted_token": "...", "result_code": "10000" }
④ GET session → data.id（真人组 id）→ import → 视频
```

`result_code` 成功值为 **`10000`**（字符串）。

---

## 1. POST /api/lynx/volc-assets/liveness/sessions

| 字段 | 必填 | 说明 |
|------|------|------|
| display_name | 否 | 真人展示名 |
| language | 否 | `zh` / `en` / `zh-Hant`，默认 zh |
| callback_url | 否 | https；传入则 client 模式 |
| webhook_url | 否 | https；终态事件通知 |

```bash
curl -X POST "https://tokens.lynxtoncloud.com/api/lynx/volc-assets/liveness/sessions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"display_name":"模特小美","language":"zh"}'
```

---

## 2. GET /api/lynx/volc-assets/liveness/sessions/{session_id}

| 字段 | 说明 |
|------|------|
| session_id | 会话 id（创建时返回） |
| status | `pending` / `succeeded` / `failed` |
| h5_url | 真人打开的 H5 链接 |
| id | **`status=succeeded` 时为真人组 id**，用于 import Body |
| callback_mode | `platform` / `client` |

---

## 3. POST .../sessions/{session_id}/complete（client 模式）

| 字段 | 必填 | 说明 |
|------|------|------|
| byted_token | 是 | 火山回调 Query 中的 token |
| result_code | 是 | 成功为 `10000` |

---

## 4. GET /api/lynx/volc-assets/face-groups

列出真人组。`data.items[].id` 即为真人组 id；`status=verified` 方可 import。

| status | 含义 |
|--------|------|
| pending | 未完成认证 |
| verified | 可 import |
| failed | 认证失败 |

`GET /face-groups/{id}` 查询单个组，Path `id` = 真人组 id。

---

## 5. POST /api/lynx/volc-assets/import（真人）

| 字段 | 必填 | 说明 |
|------|------|------|
| id | **是** | **真人组 id**（session 的 `data.id` 或 face-groups 的 `id`） |
| url / file_id | 二选一 | 公网 HTTPS URL 或平台 file_id |
| asset_type | 否 | `Image` 或 `Video`，默认 `Image` |
| name | 否 | 显示名 |
| wait_active | 否 | `true` 阻塞至 `Active` |

```bash
curl -X POST "https://tokens.lynxtoncloud.com/api/lynx/volc-assets/import" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "YOUR_FACE_GROUP_ID",
    "url": "https://your-cdn.example.com/portrait.png",
    "asset_type": "Image",
    "wait_active": true
  }'
```

素材 status：`pending` → `Processing` → `Active` 或 `Failed`（见 `fail_reason`）。

按真人组筛素材：

```bash
curl "https://tokens.lynxtoncloud.com/api/lynx/volc-assets?id=YOUR_FACE_GROUP_ID&group_type=LivenessFace" \
  -H "Authorization: Bearer $API_KEY"
```

---

## 6. 视频生成

import 成功后使用 `data.asset_ref`（`asset://...`）调用 `POST /v1/videos`，详见 **Seedance 视频** 指南。

---

## 相关

- **Seedance 2.0 虚拟人**（AIGC，无需活体）
- **Seedance 视频**（`content` + `asset_ref`）
- **API 参考 → 真人人像库**
