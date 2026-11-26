# Seedance 视频

## 豆包 Seedance 视频

## 接入方式

入口为 **OpenAI Video 兼容**（`POST /v1/videos`），请求体字段对齐火山 Seedance 视频生成任务 API；网关会把参数转发给上游。

| 操作 | 方法 | 路径 |
|------|------|------|
| 创建任务 | POST | `/v1/videos` |
| 查询任务 | GET | `/v1/videos/{task_id}` |
| 下载视频 | GET | `/v1/videos/{task_id}/content` |

Base URL：`{{baseUrl}}`

## 从模型库获取 model

1. `GET /v1/models`（或模型广场 `GET /api/lynx/catalog/models?category=video`）取 **`name` / `data[].id`**
2. 调用 `POST /v1/videos` 时 **`model` 填该值**（大小写须一致）
3. 模型详情 `GET /api/lynx/catalog/models/:id` 的 `docs.http_api.endpoint` 为推荐入口（video 类为 `/v1/videos`）

> 不同 Token 可见模型不同，**以 `/v1/models` 实时返回为准**，勿写死文档里的示例名。

## 请求头（所有接口）

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | Header | 是 | `Bearer sk-...` |
| Content-Type | Header | POST 必填 | `application/json` |

## POST /v1/videos — Body 参数

### 基础字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | video 类模型名，来自 `/v1/models` 的 `id` |
| prompt | string | 是* | 视频描述；若 `content` 中含 `type=text` 且带文本，可从中自动提取 |
| duration | integer | 否 | 时长（秒）；与 `metadata.duration` 等效，**二选一即可** |
| resolution | string | 否 | 如 `480p`、`720p`、`1080p`|
| ratio | string | 否 | 宽高比，如 `16:9`、`9:16`；与 `metadata.ratio` 等效 |

### 多模态与扩展（可写顶层，也可放在 `metadata` 同名键下）

| 字段 | 类型 | 说明 |
|------|------|------|
| content | array | 多模态内容，见下表；私域素材 URL 用 `asset://...` |
| frames | integer | 帧数（与 duration 二选一，按上游规则） |
| seed | integer | 随机种子 |
| camera_fixed | boolean | 是否固定镜头 |
| watermark | boolean | 是否加水印 |
| generate_audio | boolean | 是否生成音频 |
| reference_video_url | string | 参考视频公网 URL |
| reference_video_urls | array | 多个参考视频 URL |

### metadata 可选字段（与顶层同名字段等效）

| 字段 | 说明 |
|------|------|
| duration / resolution / ratio | 与顶层字段相同，**不要重复填写** |
| img_url | 简单图生视频：单张参考图公网 URL（等价于一张 `image_url`） |
| content | 与顶层 `content` 相同 |

### content[] 元素

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | `text` / `image_url` / `video_url` |
| text | string | `type=text` 时的文本 |
| image_url.url | string | 公网 URL 或 `asset://asset-xxx` |
| video_url.url | string | 参考视频 URL 或 `asset://...` |
| role | string | `reference_image`、`first_frame`、`last_frame`、`reference_video` 等 |

未指定 `role` 时，网关会按模型能力补全默认值。**Seedance 1.0 / 1.5 Pro 不支持多图 reference（r2v）**，带图请求会自动按首尾帧（i2v）处理，最多 2 张图。

### resolution 参考

| 值 | 说明 |
|----|------|
| `480p` | 较低分辨率 |
| `720p` | 常用 |
| `1080p` | Seedance 2.0 标准版；**fast 变体最高 720p** |

## 文生视频（curl）

将 `YOUR_VIDEO_MODEL` 替换为 `/v1/models` 返回的 video 类 `id`：

```bash
curl -X POST {{baseUrl}}/v1/videos \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_VIDEO_MODEL",
    "prompt": "一只猫在草地上奔跑，电影感",
    "duration": 5,
    "resolution": "1080p",
    "ratio": "16:9"
  }'
```

## POST /v1/videos — 响应字段（HTTP 200）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 任务 id，后续查询/下载使用 |
| task_id | string | 与 `id` 相同（兼容字段） |
| object | string | 固定 `video` |
| model | string | 请求中的 model |
| status | string | `queued` / `in_progress` / `completed` / `failed` |
| progress | integer | 进度 0–100 |
| created_at | integer | 创建时间（Unix 秒） |
| completed_at | integer | 完成时间（完成后才有） |
| metadata.url | string | 完成后视频 URL（查询接口返回） |
| error.message | string | 失败时的错误信息 |
| error.code | string | 失败时的错误码 |

火山上游任务状态为 `succeeded`；平台对外映射为 `completed`。

## GET /v1/videos/{task_id}

Path 参数 `task_id` = 创建任务返回的 `id`。

```bash
curl "{{baseUrl}}/v1/videos/$TASK_ID" \
  -H "Authorization: Bearer $API_KEY"
```

## GET /v1/videos/{task_id}/content

任务 `status=completed` 后下载视频：

```bash
curl -L "{{baseUrl}}/v1/videos/$TASK_ID/content" \
  -H "Authorization: Bearer $API_KEY" \
  -o output.mp4
```

## 异步流程

1. `POST /v1/videos` → 返回 `id`，`status` 多为 `queued`
2. 轮询 `GET /v1/videos/{task_id}` 直到 `status` 为 **`completed`**（失败为 `failed`）
3. `GET /v1/videos/{task_id}/content` 下载成片

## 简单图生视频（单张公网图）

```json
{
  "model": "YOUR_VIDEO_MODEL",
  "prompt": "人物缓缓转头",
  "duration": 5,
  "ratio": "16:9",
  "metadata": {
    "img_url": "https://your-cdn.example.com/frame.png"
  }
}
```

## 多模态 + 私域素材（虚拟人 / 真人人像）

先从素材库 `import` 取得 `asset_ref`（见 **Seedance 虚拟人** / **Seedance 真人人像**），再在 `content` 中引用：

```bash
curl -X POST {{baseUrl}}/v1/videos \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "YOUR_VIDEO_MODEL",
    "duration": 5,
    "resolution": "1080p",
    "ratio": "16:9",
    "content": [
      {
        "type": "text",
        "text": "图片1中的博主用中文介绍产品，近景镜头，笑容自然"
      },
      {
        "type": "image_url",
        "image_url": { "url": "asset://asset-20260318035710-xxx" },
        "role": "reference_image"
      }
    ]
  }'
```

| 项 | 说明 |
|----|------|
| `asset://...` | 来自 import 响应的 `data.asset_ref`；素材须 `status=Active` |
| `role` | 多参考用 `reference_image`；首尾帧用 `first_frame` / `last_frame` |
| Prompt | 用「图片1、图片2」指代 `content` 中素材顺序，不要在文本里写 Asset ID |

## 相关

- 虚拟人素材 → **Seedance 2.0 虚拟人**
- 真人人像素材 → **Seedance 真人人像**
- **快速开始** → 模型库调用流程
