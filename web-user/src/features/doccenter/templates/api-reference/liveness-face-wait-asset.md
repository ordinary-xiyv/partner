# 等待真人素材 Active

**POST** `/api/lynx/volc-assets/{id}/wait`


阻塞轮询至 status=Active 或 Failed/超时；import 时也可设 wait_active:true。


## 请求参数

| 参数 | 位置 | 必填 | 说明 |
|------|------|------|------|
| Authorization | header | 是 | API Token，格式 Bearer sk-... |
| id | path | 是 |  |


## 响应

### 200
