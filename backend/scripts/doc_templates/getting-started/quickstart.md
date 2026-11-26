# 快速开始

## 1. 创建 Token

控制台 → 令牌管理 → 创建 → 复制 `sk-...`（完整 Key 仅显示一次）。

## 2. 列出可用模型

### 方式 A：API（推荐，与调用一致）

```bash
curl {{baseUrl}}/v1/models \
  -H "Authorization: Bearer sk-your-api-key"
```

| 字段 | 说明 |
|------|------|
| data[].id | **调用时 body 中的 `model` 字段**（大小写须一致） |
| data[].modalities | `text` / `image` / `video` 等 |

不同 Token 可见模型可能不同。

### 方式 B：模型库（浏览价格与接入示例）

无需登录即可浏览列表；**实际调用仍用同一 API Key**。

```bash
# 列表（可按 category 筛选：llm / image / video 等）

curl "{{baseUrl}}/api/lynx/catalog/models?page=1&page_size=20"

# 详情（含推荐 endpoint 与 curl 示例）

curl "{{baseUrl}}/api/lynx/catalog/models/1"
```

| 字段 | 说明 |
|------|------|
| data.items[].name | 与 `/v1/models` 的 `id` 相同，即 **`model` 参数值** |
| data.docs.http_api.endpoint | 推荐接口路径，如 `/v1/chat/completions` |
| data.docs.http_api.curl | 可复制示例（将 `$LYNX_API_KEY` 换成你的 Key） |

## 3. 从模型库到第一次调用

```text
① 取 model 名：/v1/models 的 data[].id，或模型库 data.name

② 看 category 或 modalities，选 endpoint：

     text  → POST /v1/chat/completions

     image → POST /v1/images/generations

     video → POST /v1/videos

③ 同一 Authorization: Bearer sk-... 发起请求
```

Seedance 虚拟人/真人人像还需先走素材库 `import`，见 **Seedance 虚拟人** / **Seedance 真人人像** 指南。

## 4. 对话示例（OpenAI 格式）

将 `YOUR_MODEL` 换成上一步取得的 **text** 类 model 名：

```bash
curl {{baseUrl}}/v1/chat/completions \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{

    "model": "YOUR_MODEL",

    "messages": [{"role": "user", "content": "Hello"}]

  }'
```

完整 Body / 响应字段见 **通用 OpenAI Chat 参数与响应**。

## 5. OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="{{baseUrl}}/v1",
)

resp = client.chat.completions.create(
    model="YOUR_MODEL",  # 来自 /v1/models
    messages=[{"role": "user", "content": "Hello"}],
)

print(resp.choices[0].message.content)
```

## 下一步

- **通用 OpenAI Chat 参数与响应** → 完整 Header / Body / 响应字段表

- **模型指南** → 按厂商查看示例（DeepSeek、GLM、Seedance…）

- **API 参考** → 接口参数详情
