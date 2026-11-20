# MiniMax

## 接入方式

**OpenAI 兼容**。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/chat/completions` |
| Base URL | `https://tokens.lynxtoncloud.com/v1` |

## 请求参数

Header、Body 字段及响应结构见 **通用 OpenAI Chat 参数与响应**。

## model 参数

**以 `GET /v1/models` 返回为准**（与模型库 `name` 相同）。常见示例：`Minimax-M2.5`

## curl 示例

```bash
curl https://tokens.lynxtoncloud.com/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Minimax-M2.5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## 相关

- **API 参考** → `POST /v1/chat/completions`
