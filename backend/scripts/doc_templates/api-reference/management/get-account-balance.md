# 查询账户余额

**GET** `/v1/account/balance`

根据 API Key 查询**账户余额**（非令牌额度）。

- 个人用户：返回 `users.quota`
- 企业成员（member/viewer）：返回当前账号个人剩余额度（`quota_limit - used_quota`；未分配时为 0）
- 企业管理员（owner/admin）：返回企业总池剩余额度（`org.quota - org.used_quota`）

`balance_scope` 标明余额口径：`personal`（个人/成员）或 `org_pool`（企业总池）。

**curl**

```bash
curl "{{baseUrl}}/v1/account/balance" \
  -H "Authorization: Bearer sk-your-api-key"
```

## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |

## 响应

### 200 — 成功

```json
{
  "object": "account_balance",
  "balance": 500000,
  "balance_display": 5,
  "display_unit": "USD",
  "balance_scope": "personal",
  "used_quota": 120000
}
```

### 401 — Token 无效

```json
{
  "error": {
    "message": "Invalid token",
    "type": "invalid_request_error"
  }
}
```

### 403 — 账号已禁用
