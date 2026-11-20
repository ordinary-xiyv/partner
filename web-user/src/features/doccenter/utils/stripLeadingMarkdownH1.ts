/** 公开页已有 docs-page__title，去掉正文首个 # 标题避免重复 */
export function stripLeadingMarkdownH1(content: string): string {
  return content.replace(/^\s*#\s+[^\n]*(?:\r?\n|$)/, '');
}
