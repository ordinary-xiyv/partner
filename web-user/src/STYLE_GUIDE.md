# 前端样式规范 — LynxtonAPI

> 所有页面必须同时支持亮/暗主题。本规范是强制约束，违反将导致主题切换失效。

---

## 核心原则：禁止硬编码颜色

❌ **禁止** 直接写颜色值：
```tsx
color: '#fafafa'          // 亮色下看不见
background: '#18181b'     // 亮色下全黑
border: 'rgba(255,255,255,0.08)'  // 亮色下无效
```

✅ **必须** 使用 CSS 变量：
```tsx
color: 'var(--text-primary)'
background: 'var(--bg-card)'
border: '1px solid var(--border-default)'
```

---

## CSS 变量速查表

| 变量 | 暗色 | 亮色 | 用途 |
|------|------|------|------|
| `--bg-base` | #09090b | #ffffff | 侧栏、顶栏等「贴边」区域 |
| `--bg-page` | #09090b | #F9FAFC | **主内容区灰底**（列表页滚动区域） |
| `--bg-card` | #18181b | #ffffff | **列表/表格白色卡片** |
| `--bg-elevated` | #111113 | #f4f4f5 | **仅**表头、骨架屏、列表 hover；可编辑输入/筛选用 `--bg-card` |
| `--bg-hover` | #1f1f23 | #f0f0f1 | hover 状态 |
| `--border-default` | rgba(255,255,255,0.08) | rgba(0,0,0,0.08) | 默认边框 |
| `--border-hover` | rgba(255,255,255,0.16) | rgba(0,0,0,0.16) | hover/focus 边框 |
| `--text-primary` | #fafafa | #09090b | 主要文字 |
| `--text-secondary` | rgba(255,255,255,0.6) | rgba(0,0,0,0.65) | 次要文字 |
| `--text-tertiary` | rgba(255,255,255,0.35) | rgba(0,0,0,0.38) | 辅助文字、placeholder |
| `--accent-primary` | 品牌紫（见 `theme/brandTokens.ts`） | 品牌紫 | 强调色，由 `applyBrandCSSVariables` 注入 |
| `--accent-blue` | #3b82f6 | #2563eb | 蓝色强调 |
| `--accent-purple` | #818cf8 | #7c3aed | 紫色强调 |

### 特殊用途颜色（两主题通用）
```tsx
// 危险/错误
color: '#f87171'   // 可以保留，两主题下都可读

// 成功
color: '#34d399'   // 可以保留

// overlay 遮罩（modal 背景）
background: 'rgba(0,0,0,0.45)'   // 可以保留，天然是黑色半透明

// box-shadow
boxShadow: '0 20px 60px rgba(0,0,0,0.2)'   // 可以保留
```

---

## 列表页视觉规范（已确认）

### 页面层次

| 层级 | Token | 说明 |
|------|--------|------|
| 主内容区底 | `--bg-page` | 灰底（亮色 `#F9FAFC`），与白色卡片形成对比 |
| 列表/表格外壳 | `--bg-card` | 白色卡片（亮色 `#fff`），如 `PagePanel`、`AsyncTableCard` |
| 表头 | antd `Table` + `--bg-elevated` | **保持**浅灰表头 + 白色表体，不改 |
| 表体行 | antd 默认 | 白色背景，hover 用 `--bg-hover` |

主内容区应使用 `background: var(--bg-page)`（`MainLayout` 的 `.layout-main` 待统一迁移），**不要**把整块列表区改成纯白。

### 页面标题与字号

- **必须**用 `AppPageHeader`（`Title level={2}`），禁止各页自写 `<h1 style={{ fontSize: 24 }}>`。
- 字号层级：标题 24px / 800；副标题 13px secondary；工具栏与表格正文 13px；辅助 label 12px tertiary。

### 筛选区 / 表单控件（图 3、图 4 类问题）

- **必须**使用 antd `Input`、`Select`、`DatePicker`、`Button`；禁止原生 `<input>` + 行内灰底。
- **禁止**在筛选条给控件写 `background: var(--bg-elevated)`（账单日期框等）；亮色下控件应为 **antd 默认白底**，仅边框/ focus 走主题。
- 工具栏放在白色卡片内（`AsyncTableCard` 顶栏或 `PagePanel`），与灰底页面区分的是**卡片**，不是把输入框本身涂灰。

### 参考实现

- 表格列表：`Logs.tsx` + `AsyncTableCard` + `AppPageHeader`
- 卡片列表：白卡片叠在 `--bg-page` 上（令牌页目标形态）
- 待对齐：`Tokens.tsx`（自定义 h1 / 原生 input）、`Billing.tsx`（DatePicker 强制灰底）

---

## Ant Design 与薄封装（推荐）

- **全站主题**：`src/antdTheme.ts` + `AntdAppProvider`（表格表头字色与正文对齐、Tag/Pagination 等）。
- **页面顶栏 / 空状态**：`src/ui/appLayout.tsx` 的 `AppPageHeader`、`AppEmpty`（内部仅用 `antd` 的 Flex、Typography、Empty）。
- **表单与布局**：直接使用 `antd` 的 `Input`、`Button`、`Card`、`Divider` 等；需要自定义时用 `theme.components` 或组件 `styles` / `classNames`。
- **用量日志 type 标签**：`src/ui/logTypeTag.tsx`（文案只走 i18n，不在代码里写死）。

```tsx
import { Table, Button, Tag, Input, Card, Divider } from 'antd';
import { AppPageHeader, AppEmpty } from '../ui/appLayout';

<AppPageHeader title="令牌管理" subtitle="管理你的 API 访问令牌" actions={<Button type="primary">新建</Button>} />

<Tag color="success">启用</Tag>
<Tag color="error">禁用</Tag>

<AppEmpty icon="🔑" message="暂无数据" />
```

---

## 全局通知（message / toast）

- **禁止** 页面内 `import { message } from 'antd'` 或 `react-toastify`
- **必须** 使用 `notifyApiSuccess` / `notifyApiError` / `notifyApiErrorFromErr`（`src/lib/notifyApi.ts`）
- 后端返回的 `message` 经 `formatApiMessage` 自动 i18n（见 `docs/04-development/lynx-api-messages.md`）

```ts
import { notifyApiSuccess, notifyApiError, notifyApiErrorFromErr } from '../lib/notifyApi';

notifyApiSuccess(res.data.message);
notifyApiError(res.data.message, { fallbackKey: 'notify.operationFailed' });
notifyApiErrorFromErr(err, { fallbackKey: 'notify.operationFailed' });
```

## 布局面板

```tsx
import { PagePanel } from '../ui/PagePanel';

<PagePanel padded>{/* 内容 */}</PagePanel>
```

## 新增页面检查清单

在提交新页面前，逐项检查：

- [ ] 列表页：主区 `--bg-page`，卡片 `--bg-card`；筛选控件用 antd 默认白底
- [ ] 页面标题用 `AppPageHeader`，字号符合列表页规范
- [ ] 所有背景色用 CSS 变量（bg-page/card/elevated/hover）
- [ ] 所有文字颜色用 CSS 变量（text-primary/secondary/tertiary）
- [ ] 所有边框用 CSS 变量（border-default/hover）
- [ ] 强调色用 CSS 变量（accent-primary/blue/purple）
- [ ] 输入框 focus 状态边框用 `var(--border-hover)`
- [ ] 表格/列表 hover 背景用 `var(--bg-hover)`
- [ ] 列表分页优先用 `utils/tablePagination`；Ant 表格样式走 `antdTheme`，勿新增长篇 `.ant-*` 覆盖
- [ ] Modal/Dialog 背景用 `var(--bg-card)`，遮罩可用 `rgba(0,0,0,0.45)`
- [ ] 切换到亮色主题后，所有文字清晰可见

### 快速验证
1. 开发服务器跑起来后，点击侧边栏底部 **☀️** 切换亮色
2. 逐页检查文字是否清晰，输入框是否可见
3. 再切回 **🌙** 验证暗色正常

---

## 页面模板

新建一个典型的管理页面：

```tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Table, Button, Tag } from 'antd';
import { AppPageHeader, AppEmpty } from '../ui/appLayout';
import { PagePanel } from '../ui/PagePanel';
import { notifyApiSuccess, notifyApiError } from '../lib/notifyApi';

export default function MyPage() {
  const { t } = useTranslation();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ 正确：用 CSS 变量
  return (
    <div>
      <AppPageHeader
        title={t('myPage')}
        subtitle={t('myPageDesc')}
        actions={<Button type="primary">{t('create')}</Button>}
      />

      <PagePanel padded>
        <Table
          rowKey="id"
          dataSource={data}
          loading={loading}
          columns={[
            { title: t('name'), dataIndex: 'name' },
            {
              title: t('status'), dataIndex: 'status',
              render: (v: number) => <Tag color={v === 1 ? 'success' : 'error'}>{v === 1 ? t('enabled') : t('disabled')}</Tag>,
            },
          ]}
        />
      </PagePanel>
    </div>
  );
}
```

---

## 颜色替换速查（代码迁移参考）

| 旧值（硬编码） | 替换为 |
|---------------|--------|
| `#09090b`, `#0a0a1a`, `#0d0d22` | `var(--bg-base)` |
| `#111113` | `var(--bg-elevated)` |
| `#18181b`, `#1a1a36` | `var(--bg-card)` |
| `#1f1f23` | `var(--bg-hover)` |
| `#fafafa`, `#e2e8f0` | `var(--text-primary)` |
| `rgba(255,255,255,0.6~0.7)` | `var(--text-secondary)` |
| `rgba(255,255,255,0.3~0.5)` | `var(--text-tertiary)` |
| `rgba(255,255,255,0.08)` 边框 | `var(--border-default)` |
| `rgba(255,255,255,0.15~0.2)` 边框 | `var(--border-hover)` |
| `rgba(255,255,255,0.03~0.05)` 填充 | `var(--bg-elevated)` 或 `var(--bg-hover)` |
| `#a3e635` | `var(--accent-primary)` |
| `#818cf8`, `#6366f1` | `var(--accent-purple)` |
| `#3b82f6` | `var(--accent-blue)` |
