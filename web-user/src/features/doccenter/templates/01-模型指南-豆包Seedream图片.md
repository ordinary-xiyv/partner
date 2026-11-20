# 豆包 Seedream（图片生成）

## 接入方式

**OpenAI Images 兼容**。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/images/generations` |
| Base URL | `https://tokens.lynxtoncloud.com/v1` |

## 请求头

| 参数 | 位置 | 必填 | 类型 | 说明 |
|------|------|------|------|------|
| Authorization | Header | 是 | string | `Bearer sk-...` |
| Content-Type | Header | 是 | string | `application/json` |

## Body 参数（application/json）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | image 类 model id，见下表 |
| prompt | string | 是 | 图片描述文本 |
| size | string | 否 | 图片尺寸，如 `1024x1024` |
| n | integer | 否 | 生成张数，默认 `1` |
| response_format | string | 否 | `url`（返回链接）或 `b64_json`（返回 base64） |

## model 参数

**以 `GET /v1/models` 返回的 image 类 `id` 为准**（与模型库 `name` 相同）。常见示例：

| 示例 id | 说明 |
|---------|------|
| `doubao-seedream-5.0-lite` | Seedream 5.0 Lite |
| `doubao-seedream-4.5` | Seedream 4.5 |
| `doubao-seedream-4.0` | Seedream 4.0 |

`size` 等可选参数以火山 Seedream 官方文档为准；网关按 OpenAI Images 形态转发。
## curl 示例

```bash
curl -X POST https://tokens.lynxtoncloud.com/v1/images/generations \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "doubao-seedream-5.0-lite",
    "prompt": "一只橙色机械猫坐在未来城市屋顶，电影感光影",
    "n": 1,
    "size": "1024x1024",
    "response_format": "url"
  }'
```

## 响应字段（HTTP 200）

OpenAI Images 兼容格式：

| 字段 | 类型 | 说明 |
|------|------|------|
| created | integer | Unix 时间戳 |
| data | array | 生成结果列表 |
| data[].url | string | 图片 URL（`response_format=url` 时） |
| data[].b64_json | string | Base64 图片（`response_format=b64_json` 时） |
| data[].revised_prompt | string | 部分上游会返回修订后的 prompt |

### 响应示例

```json
{
  "created": 1780882800,
  "data": [
    {
      "url": "https://example-cdn.volcengine.com/generated/abc123.png",
      "revised_prompt": "一只橙色机械猫坐在未来城市屋顶，电影感光影"
    }
  ]
}
```

## 相关

- **API 参考** → 图片生成 → `POST /v1/images/generations`
