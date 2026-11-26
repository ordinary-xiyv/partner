# Qwen-Image

## 文生图（T2I）

### 请求头

| 参数 | 位置 | 必填 | 说明 |
|---|---|---:|---|
| `Authorization` | Header | 是 | 平台 API Key，格式：`Bearer sk-...`。 |
| `Content-Type` | Header | 是 | 固定为 `application/json`。 |

### 请求字段

接口：`POST {{baseUrl}}/v1/images/generations`

| 字段 | 类型 | 必填 | 说明                                                                                  |
|---|---|---:|-------------------------------------------------------------------------------------|
| `model` | string | 是 | 文生图模型 ID，例如 `qwen-image-3.0` `qwen-image-3.0-pro`。         |
| `prompt` | string | 是 | 图片描述。建议写明主体、场景、构图、风格、光线与画面文字。             |
| `size` | string | 否 | 输出图像的分辨率，格式为 `宽x高`，例如 `1024*1024`。可用范围以模型实际支持情况为准。未指定时由模型根据提示词自动推荐分辨率  |
| `n` | integer | 否 | 生成数量，默认 `1`；受模型和账户配额限制。                                                             |
| `response_format` | string | 否 | `url` 返回图片 URL，`b64_json` 返回 Base64 图片数据。                                    |
| `seed` | integer | 否 | 随机数种子，取值范围为[0, 2147483647]，未传入时，服务会随机选择种子。固定种子可使生成结果相对稳定。  |
| `watermark` | boolean | 否 | 是否添加水印，默认值为 false。                                                                              |

### curl 示例

```bash
curl -X POST '{{baseUrl}}/v1/images/generations' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen-image-3.0",
    "prompt": "雨后的上海街头，电影感广角构图，霓虹灯映在湿润路面；画面右下角有清晰中文招牌：云端咖啡",
    "size": "1328x1328",
    "n": 1,
    "response_format": "url",
    "watermark": false
  }'
```

`200 OK` 响应示例：

```json
{
  "created": 1760000000,
  "data": [
    {
      "url": "https://cdn.example.com/generated/qwen-image.png",
      "revised_prompt": "",
      "b64_json": ""
    }
  ]
}
```

若选择 `b64_json`，图片内容位于 `data[0].b64_json`；若使用 `url`，应及时下载。

参数错误示例（`400`）：

```json
{
  "error":{
    "message":"response_format must be one of b64_json or url (request id: req_xxx)",
    "type":"invalid_request_error",
    "param":"response_format",
    "code":"invalid_request"
  }
}
```

## 图生图 / 图像编辑（I2I）

### 请求头

接口：`POST {{baseUrl}}/v1/images/generations`

| 参数 | 位置 | 必填 | 说明 |
|---|---|---:|---|
| `Authorization` | Header | 是 | 平台 API Key，格式：`Bearer sk-...`。 |
| `Content-Type` | Header | 是 | 固定为 `application/json`。 |

### 请求字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `model` | string | 是 | 图像编辑模型 ID，如 `qwen-image-edit`。 |
| `prompt` | string | 是 | 编辑目标。例如“保留人物姿势和服装，将背景替换为傍晚海边”。 |
| `size` | string | 否 | 目标尺寸，格式如 `1328x1328`。源图比例与目标比例不同可能产生裁切或补画。 |
| `n` | integer | 否 | 输出变体数，默认 `1`。 |
| `response_format` | string | 否 | `url` 或 `b64_json`。 |
| `image` | 否 | string/array | 参考图 URL、data URL 或 URL 数组 |
| `seed` | integer | 否 | 随机数种子，取值范围为[0, 2147483647]，未传入时，服务会随机选择种子。固定种子可使生成结果相对稳定。|
| `watermark` | boolean | 否 | 是否添加水印。 |

### curl 示例

```bash
curl -X POST '{{baseUrl}}/v1/images/generations' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen-image-3.0",
    "image": "https://example.com/product.png"
    "prompt": "雨后的上海街头，电影感广角构图，霓虹灯映在湿润路面；画面右下角有清晰中文招牌：云端咖啡",
    "n": 1,
    "response_format": "url",
    "watermark": true
  }'
```

多图：

```bash
curl -X POST '{{baseUrl}}/v1/images/generations' \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen-image-3.0",
    "image": ["https://example.com/product.png", "https://example.com/product.png"],
    "prompt": "雨后的上海街头，电影感广角构图，霓虹灯映在湿润路面；画面右下角有清晰中文招牌：云端咖啡",
    "n": 1,
    "response_format": "url",
    "watermark": true
  }'
```

`200 OK` 响应示例：

```json
{
  "created": 1760000000,
  "data": [
    {
      "url": "https://cdn.example.com/generated/qwen-image.png",
      "revised_prompt": "",
      "b64_json": ""
    }
  ]
}
```

若选择 `b64_json`，图片内容位于 `data[0].b64_json`；若使用 `url`，应及时下载。

参数错误示例（`400`）：

```json
{
  "error":{
    "message":"response_format must be one of b64_json or url (request id: req_xxx)",
    "type":"invalid_request_error",
    "param":"response_format",
    "code":"invalid_request"
  }
}
```
