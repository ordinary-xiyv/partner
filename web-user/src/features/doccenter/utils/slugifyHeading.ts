export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface MarkdownHeading {
  level: 2 | 3;
  text: string;
  id: string;
}

export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  content.split('\n').forEach((line) => {
    const match = /^(#{2,3})\s+(.+)$/.exec(line.trim());
    if (!match) return;
    const level = match[1].length as 2 | 3;
    const text = match[2].replace(/\s+#+\s*$/, '').trim();
    if (!text) return;
    headings.push({ level, text, id: slugifyHeading(text) });
  });
  return headings;
}
