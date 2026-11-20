export const CODE_PYTHON = `from openai import OpenAI

client = OpenAI(
    base_url="https://api.lynxtoncloud.com/v1",
    api_key="你的_API_KEY",
)
resp = client.chat.completions.create(
    model="deepseek-v3-2-251201",
    messages=[{"role": "user", "content": "Hello!"}],
)`;

export const CODE_NODE = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.lynxtoncloud.com/v1",
  apiKey: "你的_API_KEY",
});
const resp = await client.chat.completions.create({
  model: "deepseek-v3-2-251201",
  messages: [{ role: "user", content: "Hello!" }],
});`;

export const CODE_CURL = `curl https://api.lynxtoncloud.com/v1/chat/completions \\
  -H "Authorization: Bearer 你的_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-v3-2-251201",
    "messages": [{"role":"user","content":"Hello!"}]
  }'`;

export const CODE_TABS = [
  { label: 'Python', code: CODE_PYTHON },
  { label: 'Node.js', code: CODE_NODE },
  { label: 'curl', code: CODE_CURL },
] as const;
