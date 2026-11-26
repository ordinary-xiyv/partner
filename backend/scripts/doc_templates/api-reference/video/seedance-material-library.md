# Seedance 素材库 API 接入

Base URL：`{{baseUrl}}`

## 1. 鉴权

请求头传递：

```http
Authorization: Bearer sk-<API_TOKEN>
Content-Type: application/json
```

获取方式：登录控制台 → 令牌管理

亦兼容 AK/SK HMAC-SHA256 签名头（`X-Date`、`X-Content-Sha256`）传入（签名校验与平台令牌二选一，AK/SK需联系管理员启用）。

## 2. Action接口

### 支持的

- `CreateVisualValidateSession`：创建真人认证会话。
- `GetVisualValidateResult`：查询真人认证结果。
- `ListFaceGroups`：分页查询真人组列表。
- `GetFaceGroup`：查询单个真人组详情。
- `DeleteFaceGroup`：删除真人组。
- `CreateAssetGroup`：创建素材组，用于归类同一批素材。
- `GetAssetGroup`：查询单个素材组详情。
- `ListAssetGroups`：分页查询素材组列表。
- `UpdateAssetGroup`：更新素材组名称、描述等信息。
- `DeleteAssetGroup`：删除素材组；组内素材会一并删除。
- `CreateAsset`：向指定素材组导入单个素材。
- `GetAsset`：查询单个素材详情与处理状态。
- `ListAssets`：分页查询素材列表。
- `UpdateAsset`：更新素材名称等元信息。
- `RefreshAsset`：刷新素材。
- `DeleteAsset`：删除单个素材。

### 使用说明

- `CreateAsset` 为异步接口；返回 `Result.Id` 后，请通过 `GetAsset` 或 `ListAssets` 查询状态。
- 当素材状态为 `Active` 后，才可用于视频任务。

### Action 请求与返回示例

#### CreateVisualValidateSession 请求示例

```http
POST /api/lynx/materials?Action=CreateVisualValidateSession&Version=2024-01-01
{
  "ProjectName": "",
  "DisplayName": "授权会话",
  "CallbackURL": "https://xxxxxxxx",
  "Language" : "zh"
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |
| `DisplayName` | string | 否   | 会话名称                             |
| `CallbackURL` | string | 否   | 回调地址                             |
| `Language`    | string | 否   | 语言                                 |

#### CreateVisualValidateSession 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101413035289427592903efda981yY96EsT",
        "Action": "CreateVisualValidateSession",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "BytedToken": "34ecdc4cb365dffed9501123aaedac5da2f....",
        "H5Link": "https://xxxxxxxxxxxxxx",
        "CallbackURL": "https://xxxxxxxx"
    }
}
```

#### GetVisualValidateResult 请求示例

```http
POST /api/lynx/materials?Action=GetVisualValidateResult&Version=2024-01-01
{
  "BytedToken": "34ecdc4cb365dffed9501123aaedac5da2f....",
  "ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `BytedToken`  | string | 是   | 会话Id                               |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### GetVisualValidateResult 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101413080661522286103efda98EYN3wdDE",
        "Action": "GetVisualValidateResult",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "GroupId": "group-20261016153602-qvbmz"
    }
}
```

#### ListFaceGroups 请求示例

```http
POST /api/lynx/materials?Action=ListFaceGroups&Version=2024-01-01
{
    "Filter": {
        "GroupIds": [],
        "Name": ""
    },
	"ProjectName": "",
    "PageNumber": 1,
    "PageSize": 20
}
```

| 字段              | 类型     | 必填 | 说明                                 |
| ----------------- | -------- | ---- | ------------------------------------ |
| `Filter.GroupIds` | []string | 否   | 真人组ID                             |
| `Filter.Name`     | string   | 否   | 名称                                 |
| `ProjectName`     | string   | 否   | 平台无项目概念，固定归一为 `default` |
| `PageNumber`      | int      | 否   | 页码与每页数量                       |
| `PageSize`        | int      | 否   | 每页记录数                           |

#### ListFaceGroups 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101410251077114420003efda98v62jPiiN",
        "Action": "ListFaceGroups",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Items": [
            {
                "Id": "group-20261016153602-qvbmz",
                "Name": "",
                "ProjectName": "",
                "Status": "verified"
            }
        ],
        "PageNumber": 1,
        "PageSize": 20,
        "TotalCount": 1
    }
}
```

#### GetFaceGroup 请求示例

```http
POST /api/lynx/materials?Action=GetFaceGroup&Version=2024-01-01
{
  "Id": "group-20261016153602-qvbmz",
  "ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 真人组Id                             |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### GetFaceGroup 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101410323371063150003efda988qZ4JTmp",
        "Action": "GetFaceGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "group-20261016153602-qvbmz",
        "Name": "",
        "ProjectName": "",
        "Status": "verified"
    }
}
```

#### DeleteFaceGroup 请求示例

```http
POST /api/lynx/materials?Action=DeleteFaceGroup&Version=2024-01-01
{
  "Id": "group-20261016153602-qvbmz",
  "ProjectName": ""
}
```

| 字段        | 类型   | 必填 | 说明                                 |
| ----------- | ------ | ---- | ------------------------------------ |
| `Id`        | string | 是   | 真人组Id                             |
| ProjectName | string | 否   | 平台无项目概念，固定归一为 `default` |

#### DeleteFaceGroup 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101619163478746660003efda98fzsqAYMY",
        "Action": "DeleteFaceGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "group-20261016153602-qvbmz"
    }
}
```

#### CreateAssetGroup 请求示例

```http
POST /api/lynx/materials?Action=CreateAssetGroup&Version=2024-01-01
{
  "ProjectName": "default",
  "Name": "my-reference-assets",
  "Description": "developer reference assets",
  "GroupType": "AIGC"
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |
| `Name`        | string | 是   | 素材组名称                           |
| `Description` | string | 否   | 素材组描述                           |
| `GroupType`   | string | 否   | 类型：`AIGC`（缺省 `AIGC`）          |

#### CreateAssetGroup 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101406141450190800003efda98R2bRN3wX",
        "Action": "CreateAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "group-20261016153602-qvbmz"
    }
}
```

#### GetAssetGroup 请求示例

```http
POST /api/lynx/materials?Action=GetAssetGroup&Version=2024-01-01
{
    "Id": "group-20261016153602-qvbmz",
    "ProjectName": "action1"
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 素材组`GroupId`                      |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### GetAssetGroup 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101403000854894660003efda98s9rAKobZ",
        "Action": "GetAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "CreateTime": "2024-05-14T21:27:50Z",
        "Description": "developer reference assets",
        "Id": "group-20261016153602-qvbmz",
        "GroupType": "AIGC",
        "Name": "action1",
        "ProjectName" : "default",
        "UpdateTime": "2024-05-14T21:27:50Z"
    }
}
```

#### ListAssetGroups 请求示例

```http
POST /api/lynx/materials?Action=ListAssetGroups&Version=2024-01-01
{
  "Filter": {
    "GroupIds": [],
    "GroupType": "",
    "Name": ""
  },
  "SortBy": "",
  "SortOrder": "",
  "ProjectName": "",
  "PageNumber": 1,
  "PageSize": 10
}
```

| 字段               | 类型     | 必填 | 说明                                   |
| ------------------ | -------- | ---- | -------------------------------------- |
| `Filter.GroupIds`  | []string | 否   | 素材组ID                               |
| `Filter.GroupType` | string   | 是   | 类型：`AIGC`                           |
| `Filter.Name`      | string   | 否   | 名称                                   |
| `SortBy`           | string   | 否   | 仅支持 CreateTime、UpdateTime、GroupId |
| `SortOrder`        | string   | 否   | 排序顺序（Asc，Desc）                  |
| `PageNumber`       | string   | 否   | 平台无项目概念，固定归一为 `default`   |
| `PageNumber`       | int      | 否   | 页码与每页数量                         |
| `PageSize`         | int      | 否   | 每页记录数                             |

#### ListAssetGroups 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101403414398368360003efda98Vpqpd1Uc",
        "Action": "ListAssetGroups",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Items": [
            {
                "CreateTime": "2024-05-14T21:27:50Z",
                "Id": "group-20261016153602-qvbmz",
                "GroupType": "AIGC",
                "Name": "action",
                "ProjectName" : "default",
                "Description": "developer reference assets",
                "UpdateTime": "2024-05-14T21:27:50Z"
            }
        ],
        "PageNumber": 1,
        "PageSize": 20,
        "TotalCount": 1
    }
}
```

#### UpdateAssetGroup 请求示例

```http
POST /api/lynx/materials?Action=UpdateAssetGroup&Version=2024-01-01
{
  "Id": "group-20261016153602-qvbmz",
  "Name": "rename",
  "Description": "updated description",
  "ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 素材组`GroupId`                      |
| `Name`        | string | 否   | 素材组名称                           |
| `Description` | string | 否   | 素材组描述                           |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### UpdateAssetGroup 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101403012599981880003efda98LSIWhIbj",
        "Action": "UpdateAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "group-20261016153602-qvbmz"
    }
}
```

#### DeleteAssetGroup 请求示例

```http
POST /api/lynx/materials?Action=DeleteAssetGroup&Version=2024-01-01
{
    "Id": "group-20261016153602-qvbmz",
  	"ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 素材组`GroupId`                      |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### DeleteAssetGroup 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101403415516883160003efda986AEkIYtC",
        "Action": "DeleteAssetGroup",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "group-20261016153602-qvbmz"
    }
}
```

#### CreateAsset 请求示例

```http
POST /api/lynx/materials?Action=CreateAsset&Version=2024-01-01
{
  "ProjectName": "default",
  "GroupId": "group-20261016153602-qvbmz",
  "URL": "https://gips0.baidu.com/it/u=3602773692,1512483864&fm=3028&app=3028&f=JPEG&fmt=auto?w=960&h=1280",
  "Name": "test",
  "AssetType": "Image"
}
```

| 字段        | 类型   | 必填 | 说明                                                         |
| ----------- | ------ | ---- | ------------------------------------------------------------ |
| ProjectName | string | 否   | 平台无项目概念，固定归一为 `default`                         |
| `GroupId`   | string | 是   | 认证素材组 ID                                                |
| `URL`       | string | 是   | 素材源地址，**公网可直接下载的 HTTPS URL**（不支持 Cookie/防盗链/仅内网地址） |
| `Name`      | string | 否   | 素材名称（最多 64 字符）                                     |
| `AssetType` | string | 是   | `Image` / `Video` / `Audio`                                  |

#### CreateAsset 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101413332639825112003efda98aC4uEKTC",
        "Action": "CreateAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "asset-20261015152855-nvzh2"
    }
}
```

#### GetAsset 请求示例

```http
POST /api/lynx/materials?Action=GetAsset&Version=2024-01-01
{
    "Id": "asset-20261015152855-nvzh2",
    "ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 素材`AssetId`                        |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### GetAsset 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101507583474373500003efda98PpOoZb0R",
        "Action": "GetAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "AssetType": "Image",
        "CreateTime": "2024-05-14T21:27:50Z",
        "Error": {
            "Code": "",
            "Message": ""
        },
        "GroupId": "group-20261016153602-qvbmz",
        "Id": "asset-20261015152855-nvzh2",
        "Moderation": {
            "Strategy": ""
        },
        "Name": "action1",
        "ProjectName": "default",
        "Status": "Processing",
        "URL": "https://gips0.baidu.com/it/u=3602773692,1512483864&fm=3028&app=3028&f=JPEG&fmt=auto?w=960&h=1280",
        "UpdateTime": "2024-05-14T21:27:50Z"
    }
}
```

#### ListAssets 请求示例

```http
POST /api/lynx/materials?Action=ListAssets&Version=2024-01-01
{
    "Filter": {
        "GroupIds": [],
        "GroupType": "",
        "Statuses": [],
        "Name": ""
    },
    "SortBy": "",
  	"SortOrder": "",
  	"ProjectName": "",
    "PageNumber": 1,
    "PageSize": 20
}
```

| 字段               | 类型     | 必填 | 说明                                   |
| ------------------ | -------- | ---- | -------------------------------------- |
| `Filter.GroupIds`  | []string | 否   | 素材组ID                               |
| `Filter.GroupType` | string   | 是  | 类型：`AIGC`                           |
| `Filter.Statuses`  | string   | 否   | `Active` / `Processing` / `Failed`     |
| `Filter.Name`      | string   | 否   | 名称                                   |
| `SortBy`           | string   | 否   | 仅支持 CreateTime、UpdateTime、GroupId |
| `SortOrder`        | string   | 否   | 排序顺序（Asc，Desc）                  |
| `ProjectName`      | string   | 否   | 平台无项目概念，固定归一为 `default`   |
| `PageNumber`       | int      | 否   | 页码与每页数量                         |
| `PageSize`         | int      | 否   | 每页记录数                             |

#### ListAssets 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101507491482602090003efda98FmDpDeCI",
        "Action": "ListAssets",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Items": [
            {
                "AssetType": "Image",
                "CreateTime": "2024-05-14T21:27:50Z",
                "Error": {
                    "Code": "",
                    "Message": ""
                },
                "GroupId": "group-20261016153602-qvbmz",
                "Id": "asset-20261015152855-nvzh2",
                "Moderation": {
                    "Strategy": ""
                },
                "Name": "action1",
                "ProjectName": "default",
                "Status": "Processing",
                "URL": "https://gips0.baidu.com/it/u=3602773692,1512483864&fm=3028&app=3028&f=JPEG&fmt=auto?w=960&h=1280",
                "UpdateTime": "2024-05-14T21:27:50Z"
            }
        ],
        "PageNumber": 1,
        "PageSize": 20,
        "TotalCount": 1
    }
}
```

#### UpdateAsset 请求示例

```http
POST /api/lynx/materials?Action=UpdateAsset&Version=2024-01-01
{
    "Id": "asset-20261015152855-nvzh2",
    "Name": "rename",
    "ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 素材`AssetId`                        |
| `Name`        | string | 是   | 素材素材名称（最多 64 字符）         |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### UpdateAsset 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "202610150804083350770003efda98EqKCr7Hu",
        "Action": "UpdateAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "asset-20261015152855-nvzh2"
    }
}
```

#### RefreshAsset 请求示例

```http
POST /api/lynx/materials?Action=RefreshAsset&Version=2024-01-01
{
    "Id": "asset-20261015152855-nvzh2",
    "ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 素材`AssetId`                        |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### RefreshAsset 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "202610150804083350770003efda98EqKCr7Hu",
        "Action": "RefreshAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {
        "Id": "asset-20261015152855-nvzh2"
    }
}
```

#### DeleteAsset 请求示例

```http
POST /api/lynx/materials?Action=DeleteAsset&Version=2024-01-01
{
    "Id": "asset-20261015152855-nvzh2",
    "ProjectName": ""
}
```

| 字段          | 类型   | 必填 | 说明                                 |
| ------------- | ------ | ---- | ------------------------------------ |
| `Id`          | string | 是   | 素材`AssetId`                        |
| `ProjectName` | string | 否   | 平台无项目概念，固定归一为 `default` |

#### DeleteAsset 返回示例

```json
{
    "ResponseMetadata": {
        "RequestId": "2026101508125275834910003efda98My8hkK5k",
        "Action": "DeleteAsset",
        "Version": "2024-01-01",
        "Service": "ark",
        "Region": "cn-beijing"
    },
    "Result": {}
}
```
