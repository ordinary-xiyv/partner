# DeepSeek

## 接入方式

**OpenAI 兼容**，推荐 OpenAI SDK + 改 `base_url`。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/chat/completions` |
| 鉴权 | `Authorization: Bearer sk-...` |
| Base URL | `{{baseUrl}}/v1` |

## 请求参数

Header、Body 字段及响应结构见 **通用 OpenAI Chat 参数与响应**。下表为本厂商可用 model id。

## model 参数

**以 `GET /v1/models` 返回为准**（与模型库 `name` 相同）。常见示例：

| 示例 id | 说明 |
|---------|------|
| `deepseek-v4-pro` | DeepSeek V4 Pro |
| `deepseek-v4-flash` | DeepSeek V4 Flash（推荐日常） |

## curl 示例

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [{"role": "user", "content": "解释量子纠缠"}],
    "temperature": 0.7
  }'
```

## 流式输出

```json
{
  "model": "deepseek-v4-flash",
  "stream": true,
  "messages": [{"role": "user", "content": "写一首诗"}]
}
```

响应为 SSE（`stream: true` 时）。

## Python SDK

```python
from openai import OpenAI

client = OpenAI(api_key="sk-...", base_url="{{baseUrl}}/v1")
stream = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[{"role": "user", "content": "Hello"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

## 相关

- **API 参考** → `POST /v1/chat/completions`、`GET /v1/models`
