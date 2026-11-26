# Seedance 2.0 虚拟人

无需真人活体的 **AIGC 虚拟人**流程：登记参考图/视频 → 取得 `asset_ref` → 调用 Seedance 生成视频。

真人人像（须 H5 活体 + 真人组 `id`）见 **模型指南 → Seedance 真人人像**。

---

## 整体流程

```text
① GET /v1/models 或模型库          取 video 类 model 名
② POST /api/lynx/volc-assets/import  登记参考素材（可选 id 指定 AIGC 组）
③ 确认 data.status = Active        wait_active:true 或 POST .../wait
④ 记下 data.asset_ref              形如 asset://asset-20260318-xxx
⑤ POST /v1/videos                  content 里引用 asset_ref
⑥ GET  /v1/videos/{task_id}        轮询直到 status=completed
⑦ GET  /v1/videos/{task_id}/content  下载成片
```

Base URL：`{{baseUrl}}`

### 通用请求头

| Header | 必填 | 说明 |
|--------|------|------|
| Authorization | 是 | `Bearer sk-你的API密钥` |
| Content-Type | 是（POST） | `application/json` |

扩展 API 统一响应：`{ "success": true, "message": "", "data": { ... } }`

---

## 关于字段 `id`（易混，必读）

平台用 **`id` 一个字段名** 表达不同含义，取决于接口：

| 场景 | `id` 指什么 | 从哪来 |
|------|-------------|--------|
| import **Body** 的 `id` | **素材组 id**（AIGC 组） | `GET /groups` 返回的 `data.items[].id`；省略则用账号**最早创建**的默认组 |
| import 响应 **data.id** | **素材记录 id** | 管理素材用（GET/DELETE/wait 路径参数） |
| GET 列表 **Query** `id` | **按组筛选** | 同上，填 AIGC 组 id |
| GET/DELETE/wait **Path** `/{id}` | **素材记录 id** | import 响应的 `data.id` |
| DELETE groups **Path** `/{id}` | **AIGC 组 id** | `GET /groups` 的 `items[].id` |

> 文档或 OpenAPI 里若出现 `group_id`、`face_group_id`，当前实现对应的是 **`id`**（Body / Query / Path 均如此）。虚拟人 import **不要**传真人组 id。

---

## 关键字段

| 字段 | 用在哪 | 从哪来 | 说明 |
|------|--------|--------|------|
| `url` | import Body | 公网 HTTPS 图片/视频地址 | 火山须能直接下载 |
| `file_id` | import Body（与 url 二选一） | 平台文件上传返回 | 须 `public_read` 且上传完成 |
| `asset_type` | import Body | 按文件类型填写 | **`Image` 或 `Video`**（首字母大写） |
| `id`（Body） | import | `GET /groups` 的组 `id` | 可选；指定素材归入哪个 AIGC 组 |
| `id`（Path） | 素材详情/删除/wait | import 响应 `data.id` | 素材记录 UUID |
| `asset_ref` | POST /v1/videos | import 响应 `data.asset_ref` | **生成视频用这个** |
| `group` | 素材列表/详情响应 | 自动返回 | 素材所属组 id（只读） |

---

## 枚举与大小写

| 字段 | 合法值 | 说明 |
|------|--------|------|
| `asset_type` | `Image`、`Video` | 默认 `Image` |
| `group_type`（Query） | `AIGC` | 列表筛虚拟人素材 |
| `scope`（Query） | `all`、`mine`、`official` | 默认 `all` |
| `status` | `pending`、`Processing`、`Active`、`Failed` | 区分大小写 |

---

## 1. POST /api/lynx/volc-assets/import（推荐）

### Body 参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是* | 公网 HTTPS URL（与 `file_id` 二选一） |
| file_id | string | 是* | 平台已上传文件 id |
| asset_type | string | 否 | `Image` 或 `Video`，默认 `Image` |
| name | string | 否 | 显示名称 |
| wait_active | boolean | 否 | `true` 阻塞直到 `status=Active` |
| id | string | 否 | **AIGC 素材组 id**（`GET /groups` 返回）；省略则用默认组 |
| group_name | string | 否 | 配合 `create_group:true` 新建组时的名称 |
| create_group | boolean | 否 | `true` 强制新建 AIGC 组 |
| tags | string | 否 | 标签 |

### 响应 data（AssetView）

| 字段 | 说明 |
|------|------|
| id | 素材记录 UUID（路径操作用） |
| asset_ref | **视频生成用**，如 `asset://asset-20260318035710-abc123` |
| group | 所属 AIGC 组 id |
| asset_type | `Image` / `Video` |
| status | `pending` → `Processing` → `Active` 或 `Failed` |
| source_url | 原始 URL |
| fail_reason | `Failed` 时的上游原因 |

### 请求示例

```bash
curl -X POST "{{baseUrl}}/api/lynx/volc-assets/import" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-cdn.example.com/avatar-ref.mp4",
    "asset_type": "Video",
    "name": "虚拟人全身参考",
    "wait_active": true
  }'
```

指定已有组：

```bash
curl -X POST "{{baseUrl}}/api/lynx/volc-assets/import" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-cdn.example.com/ref.png",
    "asset_type": "Image",
    "id": "YOUR_AIGC_GROUP_ID",
    "wait_active": true
  }'
```

---

## 2. GET /api/lynx/volc-assets — 列出素材

| 参数 | 默认 | 说明 |
|------|------|------|
| page | 1 | 页码 |
| page_size | 20 | 每页条数，最大 100 |
| scope | all | `all` / `mine` / `official` |
| group_type | — | 虚拟人填 `AIGC` |
| status | — | `pending` / `Processing` / `Active` / `Failed` |
| asset_type | — | `Image` 或 `Video` |
| id | — | 按 **AIGC 组 id** 筛选（`GET /groups` 返回的 `id`） |

```bash
curl "{{baseUrl}}/api/lynx/volc-assets?scope=mine&group_type=AIGC&status=Active" \
  -H "Authorization: Bearer $API_KEY"
```

---

## 3. GET /api/lynx/volc-assets/{id} — 素材详情

Path `id` = import 返回的 **素材记录** `data.id`。Query `sync=true` 时从火山同步最新 status。

---

## 4. POST /api/lynx/volc-assets/{id}/wait — 等待就绪

Path `id` = 素材记录 id。阻塞直到 `Active` 或失败。

---

## 5. DELETE /api/lynx/volc-assets/{id} — 删除素材

Path `id` = 素材记录 id。

---

## 6. POST /api/lynx/volc-assets/groups — 创建 AIGC 组（可选）

多数场景可省略：import 不传 Body `id` 时会自动使用默认组。

| 字段 | 必填 | 说明 |
|------|------|------|
| name | 是 | 组名称 |
| description | 否 | 描述 |
| group_type | 否 | 默认 `AIGC`；**不要**填 `LivenessFace` |

响应 `data.id` 即为后续 import Body 里可填的 **组 id**。

---

## 7. GET /api/lynx/volc-assets/groups — 列出 AIGC 组

响应 `data.items[]`：`id`、`name`、`asset_count`、`created_at`。

---

## 8. DELETE /api/lynx/volc-assets/groups/{id} — 删除 AIGC 组

Path `id` = 组 id（`GET /groups` 或 `POST /groups` 返回的 `data.id`）。会删除组内素材。

---

## 9. POST /api/lynx/volc-assets — 创建素材

Body：`url`/`file_id`、`asset_type`、`name`、可选 Body `id`（组 id）。功能少于 import，**推荐 import**。

---

## 然后：Seedance 视频生成

见 **模型指南 → 豆包 Seedance 视频**。在 `content` 的 `image_url.url` / `video_url.url` 中填入 **`asset_ref`**（不是素材记录 `id`）。

---

## 相关

- **API 参考 → 虚拟人素材库**
- **API 参考 → 视频生成 → OpenAI 兼容**
- **快速开始 → 从模型库发起调用**
