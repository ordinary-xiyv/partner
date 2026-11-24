# Kimi（Moonshot）

## 接入方式

**OpenAI 兼容**。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/chat/completions` |
| Base URL | `https://tokens.lynxtoncloud.com/v1` |

## 请求参数

Header、Body 字段及响应结构见 **通用 OpenAI Chat 参数与响应**。`Kimi-K2-Thinking` 等推理 model 响应中可能含 `reasoning_content`，正文仍读 `choices[0].message.content`。

## model 参数

**以 `GET /v1/models` 返回为准**（与模型库 `name` 相同）。常见示例：

| 示例 id | 说明 |
|---------|------|
| `kimi-k2.6` | Kimi K2.6 对话 |
| `Kimi-K2-Thinking` | 思考/推理类 |

## curl 示例

```bash
curl https://tokens.lynxtoncloud.com/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2.6",
    "messages": [{"role": "user", "content": "总结这段话的要点"}]
  }'
```

## 推理模型示例

```json
{
  "model": "Kimi-K2-Thinking",
  "messages": [{"role": "user", "content": "9.11 和 9.8 哪个大？"}]
}
```

## 相关

- **API 参考** → `POST /v1/chat/completions`
