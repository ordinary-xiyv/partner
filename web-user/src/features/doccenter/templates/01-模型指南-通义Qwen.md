# 通义 Qwen

## 接入方式

**OpenAI 兼容**，与 DeepSeek 相同端点，仅 `model` 不同。

| 项目 | 值 |
|------|-----|
| Endpoint | `POST /v1/chat/completions` |
| Base URL | `https://tokens.lynxtoncloud.com/v1` |
| 鉴权 | `Authorization: Bearer sk-...` |

## 请求参数

Header、Body 字段及响应结构见 **通用 OpenAI Chat 参数与响应**。视觉 model（如 `Qwen2.5-VL-72B-Instruct`）的 `messages[].content` 支持 text + image_url 多模态，见该页示例。

## model 参数

**以 `GET /v1/models` 返回为准**（与模型库 `name` 相同）。常见示例：

| 示例 id | 说明 |
|---------|------|
| `Qwen3.5` | 通用 |
| `Qwen3.5-397B-A17B-Pro` | 大规格 Pro |
| `Qwen2.5-VL-72B-Instruct` | 视觉语言 |
| `Qwen3-Coder-480B-A35B-Instruct` | 代码 |

## curl 示例

```bash
curl https://tokens.lynxtoncloud.com/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen3.5",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## Python SDK

```python
from openai import OpenAI

client = OpenAI(api_key="sk-...", base_url="https://tokens.lynxtoncloud.com/v1")
resp = client.chat.completions.create(
    model="Qwen3.5",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)
```

## 相关

- **API 参考** → `POST /v1/chat/completions`
