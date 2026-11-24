# 智谱 GLM

## 接入方式

**OpenAI 兼容**，与 DeepSeek 相同端点，仅 `model` 不同。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/chat/completions` |
| Base URL | `https://tokens.lynxtoncloud.com/v1` |

## 请求参数

Header、Body 字段及响应结构见 **通用 OpenAI Chat 参数与响应**。下表为本厂商可用 model id。

## model 参数

**以 `GET /v1/models` 返回为准**（与模型库 `name` 相同）。常见示例：

| 示例 id | 说明 |
|---------|------|
| `GLM-5.1` | GLM 5.1 |
| `GLM-5` | GLM 5 |
| `GLM4.6V` | 视觉语言 |

> 注意大小写：须与 API 返回完全一致。

## curl 示例

```bash
curl https://tokens.lynxtoncloud.com/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "GLM-5.1",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 多轮对话

```json
{
  "model": "GLM-5.1",
  "messages": [
    {"role": "system", "content": "你是助手"},
    {"role": "user", "content": "第一轮"},
    {"role": "assistant", "content": "回复"},
    {"role": "user", "content": "第二轮"}
  ]
}
```

## 相关

- **API 参考** → `POST /v1/chat/completions`
