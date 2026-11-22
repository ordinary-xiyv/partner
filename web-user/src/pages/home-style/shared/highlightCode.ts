/**
 * 极简代码着色。
 *
 * 为什么不用 highlight.js / prism：
 * 首页只需要给三个固定的 OpenAI SDK 片段上色，引一个几百 KB 的高亮库
 * 来渲染一屏代码，对首屏体积的影响和收益完全不成比例 ——
 * 而首页的体积直接影响注册转化。
 *
 * 规则按处理顺序写：先注释和字符串（它们内部的 keyword 不该被当成语法高亮），
 * 再词法关键字。整段用一次扫描拼装，不反复字符串 replace ——
 * replace 会破坏已经插入的标签。
 */

const KEYWORDS = new Set([
  'from', 'import', 'const', 'await', 'new', 'client', 'completion',
  'print', 'console', 'log', 'model', 'messages', 'role', 'content',
  'temperature', 'openai', 'OpenAI', 'base_url', 'baseURL', 'api_key', 'apiKey',
]);

export interface CodeToken {
  text: string;
  cls?: 'tok-key' | 'tok-str' | 'tok-com';
}

export function highlightCode(code: string): CodeToken[] {
  const parts: CodeToken[] = [];
  // 注释 / 双引号串 / 单引号串 / 标识符
  const re = /(#[^\n]*)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z0-9_]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(code)) !== null) {
    if (m.index > last) parts.push({ text: code.slice(last, m.index) });
    const [full, comment, dq, sq, word] = m;
    if (comment) parts.push({ text: full, cls: 'tok-com' });
    else if (dq || sq) parts.push({ text: full, cls: 'tok-str' });
    else if (word && KEYWORDS.has(word)) parts.push({ text: full, cls: 'tok-key' });
    else parts.push({ text: full });
    last = m.index + full.length;
  }
  if (last < code.length) parts.push({ text: code.slice(last) });
  return parts;
}
