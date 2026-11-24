# 创建素材组（仅 AIGC）

**POST** `/api/lynx/volc-assets/groups`


仅用于 **AIGC 虚拟人** 素材组。真人人像须使用 `POST /volc-assets/liveness/sessions` 完成认证后自动创建组。

```bash
curl -X POST "{{baseUrl}}/api/lynx/volc-assets/groups" \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-group","group_type":"AIGC"}'
```

成功时 `data.group_id` 为火山侧组 id，并写入本地组映射（可 `GET /groups` 列出）。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| Content-Type | header | 是 | POST 请求固定为 `application/json` |


## 请求示例

```json
{
  "name": "my-group",
  "description": "optional",
  "group_type": "AIGC"
}
```


## 响应

### 200 — 成功


```json

{
  "success": true,
  "message": "",
  "data": {
    "group_id": "grp-xxxx"
  }
}

```

### 503 — 火山素材 API 未配置


```json

{
  "success": false,
  "message": "素材服务暂不可用，请稍后重试或联系支持",
  "data": null
}

```
