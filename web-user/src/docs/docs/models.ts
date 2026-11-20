import type { DocArticle, DocLang } from '../types';

const modelParamsContent = {
	zh: (): string => `# 参数说明与建议

本页用于快速理解 Chat / Embeddings 常用参数，并给出可直接落地的调参建议。

## Chat 常用参数速查

| 参数 | 类型 | 常见范围 | 作用 |
|---|---|---|---|
| \`model\` | string | - | 目标模型 ID |
| \`messages\` | array | - | 对话输入（system/user/assistant） |
| \`temperature\` | number | 0 ~ 2 | 控制随机性；越低越稳定 |
| \`top_p\` | number | 0 ~ 1 | 核采样范围；与 temperature 二选一优先调一个 |
| \`max_tokens\` | number | >=1 | 限制输出长度 |
| \`stream\` | boolean | true/false | 是否流式输出 |
| \`stop\` | string/string[] | - | 命中停止词提前结束 |
| \`frequency_penalty\` | number | -2 ~ 2 | 抑制重复词频 |
| \`presence_penalty\` | number | -2 ~ 2 | 鼓励新话题 |

## Embeddings 常用参数速查

| 参数 | 类型 | 说明 |
|---|---|---|
| \`model\` | string | 嵌入模型 ID |
| \`input\` | string/string[] | 单条或批量文本 |
| \`encoding_format\` | string | 常见 \`float\`（默认）或 \`base64\` |
| \`dimensions\` | integer | 支持降维的模型可用 |

## 调参建议（开箱即用）

### 稳定回答 / 生产默认

- \`temperature = 0.2 ~ 0.5\`
- \`top_p = 1\`
- \`max_tokens\` 按页面实际需要设上限（避免成本失控）

### 创意生成 / 文案

- \`temperature = 0.8 ~ 1.2\`
- \`top_p = 0.9 ~ 1.0\`

### 代码与结构化输出

- \`temperature = 0 ~ 0.3\`
- 配合明确格式约束（例如 JSON 模板）

## 常见误区

1. **同时大幅调 temperature 和 top_p**  
   建议先固定一个，只调另一个，便于定位效果变化。

2. **max_tokens 设置过大**  
   可能导致延迟和成本明显上升。

3. **忽略模型差异**  
   同一参数在不同模型表现差异很大，建议做 A/B 验证。
`,
	en: (): string => `# Parameters & Tuning

This page is a quick reference for common Chat/Embeddings parameters with practical tuning presets.

## Chat parameter quick reference

| Parameter | Type | Typical range | Purpose |
|---|---|---|---|
| \`model\` | string | - | Target model ID |
| \`messages\` | array | - | Chat input turns |
| \`temperature\` | number | 0 ~ 2 | Randomness; lower is more deterministic |
| \`top_p\` | number | 0 ~ 1 | Nucleus sampling; usually tune one of temperature/top_p first |
| \`max_tokens\` | number | >=1 | Caps output length |
| \`stream\` | boolean | true/false | Enable streaming output |
| \`stop\` | string/string[] | - | Stop generation on matched token(s) |
| \`frequency_penalty\` | number | -2 ~ 2 | Penalize repetition frequency |
| \`presence_penalty\` | number | -2 ~ 2 | Encourage new topic tokens |

## Embeddings quick reference

| Parameter | Type | Description |
|---|---|---|
| \`model\` | string | Embedding model ID |
| \`input\` | string/string[] | Single text or batch array |
| \`encoding_format\` | string | Usually \`float\` (default) or \`base64\` |
| \`dimensions\` | integer | Optional reduced dimensions (model-dependent) |

## Practical presets

### Stable production answers

- \`temperature = 0.2 ~ 0.5\`
- \`top_p = 1\`
- Set \`max_tokens\` to your UX-required ceiling

### Creative writing

- \`temperature = 0.8 ~ 1.2\`
- \`top_p = 0.9 ~ 1.0\`

### Code / structured output

- \`temperature = 0 ~ 0.3\`
- Use explicit format constraints (e.g. strict JSON template)

## Common pitfalls

1. **Changing both temperature and top_p aggressively**  
   Tune one first for clearer effect attribution.

2. **Oversized max_tokens**  
   Can increase both latency and cost.

3. **Ignoring model variance**  
   Same params can behave differently per model; verify with A/B tests.
`,
};

export function GetModelParamsContent(_baseUrl: string, lang: DocLang): string {
	return modelParamsContent[lang]();
}

export const article: DocArticle = {
	key: 'params',
	groupKey: 'docs',
	order: 15,
	label: { zh: '参数说明', en: 'Parameters' },
	getContent: GetModelParamsContent,
};

