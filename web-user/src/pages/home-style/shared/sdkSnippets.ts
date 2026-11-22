export type SdkLang = 'python' | 'javascript' | 'curl';

/**
 * 决定首页代码示例里该显示哪个接口地址。
 *
 * 优先级（从高到低）：
 *   1. 伙伴后台配的 api_base_url —— 分销商自己的网关/中转，就是这一格存在的意义
 *   2. VITE_API_URL            —— 构建期指定的部署地址，运维级兜底
 *   3. window.location.origin  —— 当前访问的域名，最贴近「用户实际在用哪个入口」
 *
 * 早先的第一优先级是 /api/status 返回的 serverAddress（平台主站的 IP），
 * 那是白标没做完时的遗留：客户站自己没有地址可用，只好借主站的。后果是
 * 每个分销商站点上的代码示例都写着主站地址，客户照着复制就走错地方了。
 * 现在彻底删掉这条路 —— 宁可显示当前域名，也不显示主站。
 *
 * 最后那个硬编码的 tokens.lynxtoncloud.com 兜底也一并删了：它在 SSR 或
 * 极端环境下才会命中，命中时给出的仍然是主站域名，属于同一类泄漏。
 * 走到最后一步说明连 origin 都没有，返回空串让调用方自己决定怎么显示，
 * 比凭空编一个主站域名诚实。
 */
export function resolveSiteBaseUrl(partnerApiBaseUrl?: string): string {
  const fromPartner = (partnerApiBaseUrl || '').trim();
  if (fromPartner) return fromPartner.replace(/\/+$/, '');

  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return '';
}

export function buildSdkSnippet(lang: SdkLang, baseUrl: string): string {
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
