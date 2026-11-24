# 列出真人组

**GET** `/api/lynx/volc-assets/face-groups`


列出当前 Token 用户下所有真人组（H5 认证成功后自动创建）。入库素材前确认 `status=verified`，取 `face_group_id` 用于 import。

响应 `data.items[].face_group_id` 即 import 所需的 Lynx UUID（非火山 group_id）。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| page | query | 否 |  |
| page_size | query | 否 |  |
| status | query | 否 | 真人组认证状态 |


## 响应

### 200

### 401 — Token 无效


```json

{
  "success": false,
  "message": "未登录或令牌无效",
  "data": null
}

```
