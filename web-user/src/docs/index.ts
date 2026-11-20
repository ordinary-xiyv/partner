import type { TFunction } from 'i18next';
import type { DocArticle, DocLang } from './types';

interface DocArticleModule {
	article: DocArticle;
}

/** glob 在部分环境下可能对同一路径命中两次，按 key 去重 */
function docNavI18nKey(articleKey: string): string {
	return `docs.nav.${articleKey.replace(/-/g, '_')}`;
}

function LoadArticles(): DocArticle[] {
	const modules = import.meta.glob('./{docs,api}/**/*.ts', { eager: true }) as Record<string, DocArticleModule>;
	const byKey = new Map<string, DocArticle>();
	for (const moduleItem of Object.values(modules)) {
		const a = moduleItem.article;
		if (!a) continue;
		if (!byKey.has(a.key)) byKey.set(a.key, a);
	}
	return [...byKey.values()];
}

const articles: DocArticle[] = LoadArticles();

export interface DocsNavGroup {
	title: string;
	items: { key: string; label: string }[];
}

export function BuildDocsNavGroups(lang: DocLang, t: TFunction): DocsNavGroup[] {
	const groupOrder: DocArticle['groupKey'][] = ['docs', 'api', 'examples'];
	const groupsMap = new Map<DocArticle['groupKey'], { key: string; label: string }[]>();

	for (const articleItem of articles) {
		const fallback = lang === 'zh' ? articleItem.label.zh : articleItem.label.en;
		const label = t(docNavI18nKey(articleItem.key), { defaultValue: fallback });
		const current = groupsMap.get(articleItem.groupKey) || [];
		current.push({ key: articleItem.key, label });
		groupsMap.set(articleItem.groupKey, current);
	}

	const articleOrderMap = new Map(articles.map(articleItem => [articleItem.key, articleItem.order ?? 9999]));

	return groupOrder
		.map((groupKey) => {
			const items = (groupsMap.get(groupKey) || []).sort((a, b) => {
				const orderA = articleOrderMap.get(a.key) ?? 9999;
				const orderB = articleOrderMap.get(b.key) ?? 9999;
				if (orderA !== orderB) {
					return orderA - orderB;
				}
				return a.key.localeCompare(b.key);
			});
			if (items.length === 0) {
				return null;
			}
			const groupTitleKey = groupKey === 'docs' ? 'docs.gettingStarted' : groupKey === 'api' ? 'docs.apiReference' : 'docs.examples';
			return { title: t(groupTitleKey), items };
		})
		.filter((group): group is DocsNavGroup => !!group);
}

export function GetDocsContent(section: string, lang: DocLang, baseUrl: string): string {
	const article = articles.find(item => item.key === section);
	if (!article) {
		return '';
	}
	return article.getContent(baseUrl, lang);
}

