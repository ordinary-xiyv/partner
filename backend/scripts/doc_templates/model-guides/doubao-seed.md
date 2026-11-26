# 豆包 Seed

## 接入方式

**OpenAI 兼容**，用于豆包 Seed 2.0 系列**文本/代码**模型（非视频、非图片）。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/chat/completions` |
| Base URL | `{{baseUrl}}/v1` |

## 请求参数

Header、Body 字段及响应结构见 **通用 OpenAI Chat 参数与响应**。

## model 参数

**以 `GET /v1/models` 返回为准**（与模型库 `name` 相同）。常见示例：

| 示例 id | 说明 |
|---------|------|
| `Doubao-Seed-2.0-pro` | Pro |
| `Doubao-Seed-2.0-lite` | Lite |
| `doubao-seed-2.0-mini` | Mini |
| `doubao-seed-2.0-code` | 代码 |

> 大小写须与 API 返回一致。

## curl 示例

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Doubao-Seed-2.0-pro",
    "messages": [{"role": "user", "content": "用 Python 写快速排序"}]
  }'
```

## 相关

- 图片模型见 **豆包 Seedream**
- 视频模型见 **Seedance 视频**
