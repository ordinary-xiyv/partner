import type { DocArticle, DocLang } from '../types';

const examplesContent = {
	zh: (baseUrl: string): string => `# 代码示例

## Python

\`\`\`python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}/v1"
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "你好"}]
)
print(resp.choices[0].message.content)
\`\`\`

## Node.js

\`\`\`javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-api-key',
  baseURL: '${baseUrl}/v1',
});

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(resp.choices[0].message.content);
\`\`\`
`,
	en: (baseUrl: string): string => `# Code Examples

## Python

\`\`\`python
from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}/v1"
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}]
)
print(resp.choices[0].message.content)
\`\`\`

## Node.js

\`\`\`javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-api-key',
  baseURL: '${baseUrl}/v1',
});

const resp = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(resp.choices[0].message.content);
\`\`\`
`,
};

export function GetExamplesContent(baseUrl: string, lang: DocLang): string {
	return examplesContent[lang](baseUrl);
}

export const article: DocArticle = {
	key: 'examples',
	groupKey: 'examples',
	order: 10,
	label: { zh: '代码示例', en: 'Code Examples' },
	getContent: GetExamplesContent,
};

