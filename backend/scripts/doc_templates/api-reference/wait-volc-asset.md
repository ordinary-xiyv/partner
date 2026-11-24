# 等待素材 Active

**POST** `/api/lynx/volc-assets/{id}/wait`


**真人 / 虚拟共用本接口**。阻塞轮询直到素材 Active 或超时。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token。控制台「令牌管理」创建，格式 `Bearer sk-...` |
| id | path | 是 | 素材记录 id（Lynx 侧 UUID，非火山 asset_id） |


## 响应

### 200 — 成功时 data 为 AssetView

### 503 — 火山素材 API 未配置
