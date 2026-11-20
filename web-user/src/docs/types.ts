export type DocLang = 'zh' | 'en';

export interface DocArticle {
	key: string;
	groupKey: 'docs' | 'api' | 'examples';
	order?: number;
	label: {
		zh: string;
		en: string;
	};
	getContent: (baseUrl: string, lang: DocLang) => string;
}

