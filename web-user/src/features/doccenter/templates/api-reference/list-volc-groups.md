# 列出 AIGC 素材组

**GET** `/api/lynx/volc-assets/groups`


列出当前 Token 用户下已登记的 **AIGC 虚拟人** 素材组（不含真人人像组，真人组见 `GET /face-groups`）。

未传 `group_id` 的 import 会进入 **最早创建** 的默认组。每次 `POST /groups` 创建成功后均会写入本地映射。

```bash
curl "{{baseUrl}}/api/lynx/volc-assets/groups?page=1&page_size=20" \
  -H "Authorization: Bearer sk-your-api-key"
```


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| page | query | 否 |  |
| page_size | query | 否 |  |


## 响应

### 200 — 成功


```json

{
  "success": true,
  "message": "",
  "data": {
    "items": [
      {
        "group_id": "grp-xxxx",
        "name": "my-group",
        "asset_count": 3,
        "created_at": 1700000000
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}

```

### 401 — Token 无效


```json

{
  "success": false,
  "message": "未登录或令牌无效",
  "data": null
}

```
