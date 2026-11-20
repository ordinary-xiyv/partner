export type HomeAltSdkLang = 'python' | 'javascript' | 'curl';

export function resolveHomeAltSiteBaseUrl(serverAddress?: string): string {
  const fromStatus = (serverAddress || '').trim();
  if (fromStatus) return fromStatus.replace(/\/+$/, '');

  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return 'https://tokens.lynxtoncloud.com';
}

export function buildHomeAltSdkSnippet(lang: HomeAltSdkLang, baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, '');
  const apiRoot = `${root}/v1`;

  if (lang === 'python') {
    return `from openai import OpenAI

client = OpenAI(
    base_url="${apiRoot}",
    api_key="your-api-key",
)

completion = client.chat.completions.create(
    model="The model you need",
    messages=[{"role": "user", "content": "Hi"}],
    temperature=0.7,
)
print(completion.choices[0].message.content)`;
  }

  if (lang === 'javascript') {
    return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiRoot}",
  apiKey: "your-api-key",
});

const completion = await client.chat.completions.create({
  model: "The model you need",
  messages: [{ role: "user", content: "Hi" }],
  temperature: 0.7,
});
console.log(completion.choices[0].message.content);`;
  }

  return `curl ${apiRoot}/chat/completions
  -H "Authorization: Bearer $API_KEY"
  -H "Content-Type: application/json"
  -d '{
    "model": "The model you need",
    "messages": [{"role": "user", "content": "Hi"}],
    "temperature": 0.7
  }'`;
}
