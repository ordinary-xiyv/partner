# Seedream（图片生成）

## 图生图（OpenAI Images API）

> **说明**：本服务将图生图与文生图统一到 `/v1/images/generations` 接口。
> - 若仅提供 `prompt`，则为文生图（从零生成）。
> - 若同时提供 `prompt` 和 `image`（图片URL），则为图生图（基于输入图片进行风格迁移或编辑）。

火山官方参数参考：
https://www.volcengine.com/docs/82379/1541523?lang=zh

## 接入方式

**OpenAI Images 兼容**。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/images/generations` |
| Base URL | `{{baseUrl}}` |

## Seedream 系列分辨率参数汇总表

| 模型 | 档位选项 | 自定义默认尺寸 | 自定义最小总像素 | 自定义最大总像素 | 最大正方形画布 |
| ---- | -------- | -------------- | ---------------- | ---------------- | -------------- |
| Seedream 4.0 | 1K、2K、4K  | 2048×2048 | 1280x720（921600） | 4096x4096（16777216） | 4096×4096 |
| Seedream 4.5 | 2K、4K | 2048×2048 | 2560x1440（3686400） | 4096x4096（16777216） | 4096×4096 |
| Seedream 5.0 Lite | 2K、3K、4K | 2048×2048 | 2560x1440（3686400） | 4096x4096（16777216） | 4096×4096 |
| Seedream 5.0 Pro | 1K、2K| 2560 × 1440 | 1280x720（921600）|12048x2048x1.1025（4624220） | 2048x2048 |

## model 参数

**以 `GET /v1/models` 返回的 image 类 `id` 为准**（与模型库 `name` 相同）。常见示例：

| 示例 id | 说明 |
|---------|------|
| `doubao-seedream-5.0-pro` | Seedream 5.0 Pro |
| `doubao-seedream-5.0-lite` | Seedream 5.0 Lite |
| `doubao-seedream-4.5` | Seedream 4.5 |
| `doubao-seedream-4.0` | Seedream 4.0 |

---

## 单图生图（基础模式，以doubao-seedream-4.5为例）

**curl**

```bash
curl -X POST "{{baseUrl}}/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -d '{
    "model": "doubao-seedream-4.5",
    "prompt": "保持模特姿势和液态服装的流动形状不变。将服装材质从银色金属改为完全透明的清水（或玻璃）。透过液态水流，可以看到模特的皮肤细节。光影从反射变为折射。",
    "image": "https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_5_imageToimage.png",
    "size": "2K",
    "response_format": "url",
    "watermark": false
  }'
```

## 多图生图（进阶模式，以doubao-seedream-4.5为例）

**curl**

```bash
curl -X POST "{{baseUrl}}/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-api-key" \
  -d '{
    "model": "doubao-seedream-4.5",
    "prompt": "将第一张图的色调风格应用到第二张图上，同时保留第二张图的构图和主体内容",
    "images": [
      "shturl.cc/vtMJIf3AyzIJmeFVybVVNDWdXNtF8FMQM",
      "shturl.cc/mr08R9fcycCmBVGBITRzmwmHNzoiZIn"
    ],
    "size": "2K",
    "response_format": "url",
    "watermark": false
  }'
```

## 请求参数（Header）

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| Authorization | Header | 是 | string | `Bearer sk-your-api-key` |
| Content-Type | Header | 是 | string | `application/json` |

## 请求参数（Body JSON）

| 参数 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `model` | 是 | string | 模型 ID，例如 `doubao-seedream-4.5` |
| `prompt` | 是 | string | 图片描述（图生图时描述期望的编辑效果） |
| `image` | 否 | string | 输入图片的公网 URL（提供即触发图生图模式）；多图模式下则以数组形式输入，例如："images": ["shturl.cc/vtMJIf3AyzIJmeFVybVVNDWdXNtF8FMQM", "shturl.cc/mr08R9fcycCmBVGBITRzmwmHNzoiZIn"] |
| `size` | 否 | string | 输出图片尺寸，具体可选参数参照（Seedream 系列分辨率参数汇总表）填入，以doubao-seedream-4.5为例，支持 `"2K"`、`"4K"`、`"2048x2048"` 等，默认 `2048x2048` |
| `response_format` | 否 | string | `url` 或 `b64_json`，默认 `url` |
| `watermark` | 否 | boolean | 是否添加水印，默认 `false` |

> **注意**：
> - `image` 必须是公网可访问的 URL（支持 PNG / JPG）。
> - 若同时传入 `image`，接口行为变为图生图；否则为纯文生图。
> - `size` 值 `"2K"` 对应约 `2560x1440` 分辨率（16:9），具体以模型支持为准。（注：可自定义输出图片尺寸，但有自定义像素限制，具体请参考Seedream系列分辨率参数汇总表。）

---

## 响应

### 200 — OpenAI Images

```json
{
    "data": [
        {
            "url": "https://example-cdn.volcengine.com/generated/abc123.png",
            "b64_json": "",
            "revised_prompt": ""
        }
    ],
    "created": 1784864843,
}
```

### 401 — Token 无效

```json
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```

### 400 — 参数错误

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "InvalidParameter"
  }
}
```

### 400 — size 参数错误

> **说明**：以doubao-seedream-4.5为例，`size` 值须为 `"2K"`、`"2048x2048"` 等。自定义像素数取值范围需满足[2560x1440（3686400）, 4096x4096（16777216）]（不同模型自定义像素数取值范围不同，详细请参考Seedream 系列分辨率参数汇总表）

```json
{
    "error": {
        "message": "The parameter `size` specified in the request is not valid: image size must be at least 3686400 pixels",
        "type": "invalid_request_error",
        "code": "InvalidParameter"
    }
}
```
