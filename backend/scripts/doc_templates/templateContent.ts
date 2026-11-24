import authMd from './00-入门-认证.md?raw';
import quickstartMd from './00-入门-快速开始.md?raw';
import openaiChatParamsMd from './00-通用-OpenAI-Chat-参数与响应.md?raw';
import deepseekMd from './01-模型指南-DeepSeek.md?raw';
import glmMd from './01-模型指南-智谱GLM.md?raw';
import qwenMd from './01-模型指南-通义Qwen.md?raw';
import kimiMd from './01-模型指南-Kimi.md?raw';
import minimaxMd from './01-模型指南-MiniMax.md?raw';
import doubaoSeedMd from './01-模型指南-豆包Seed.md?raw';
import doubaoSeedreamMd from './01-模型指南-豆包Seedream图片.md?raw';
import seedanceVideoMd from './01-模型指南-Seedance视频.md?raw';
import seedanceAvatarMd from './01-模型指南-Seedance虚拟人.md?raw';
import seedancePortraitMd from './01-模型指南-Seedance真人人像.md?raw';
import claudeMd from './01-模型指南-Claude-Anthropic.md?raw';
import {
  API_REFERENCE_ARTICLE_SEEDS,
  API_REFERENCE_CATEGORY_SEEDS,
} from './apiReferenceManifest';

const PRODUCTION_BASE = 'https://tokens.lynxtoncloud.com';

const apiMdModules = import.meta.glob('./api-reference/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Replace hardcoded production URLs so runtime {{baseUrl}} substitution works. */
export function normalizeDocTemplateContent(content: string): string {
  return content
    .replace(new RegExp(`${PRODUCTION_BASE.replace(/\./g, '\\.')}/v1`, 'g'), '{{baseUrl}}/v1')
    .replace(new RegExp(PRODUCTION_BASE.replace(/\./g, '\\.'), 'g'), '{{baseUrl}}');
}

export interface GuideArticleTemplate {
  slug: string;
  categorySlug: 'getting-started' | 'model-guides';
  title_zh: string;
  title_en: string;
  sort: number;
  content_zh: string;
}

export const GUIDE_ARTICLE_TEMPLATES: GuideArticleTemplate[] = [
  { slug: 'auth', categorySlug: 'getting-started', title_zh: '认证', title_en: 'Authentication', sort: 10, content_zh: normalizeDocTemplateContent(authMd) },
  { slug: 'quickstart', categorySlug: 'getting-started', title_zh: '快速开始', title_en: 'Quick Start', sort: 20, content_zh: normalizeDocTemplateContent(quickstartMd) },
  { slug: 'openai-chat-params', categorySlug: 'getting-started', title_zh: '通用 OpenAI Chat 参数', title_en: 'OpenAI Chat Parameters', sort: 30, content_zh: normalizeDocTemplateContent(openaiChatParamsMd) },
  { slug: 'deepseek', categorySlug: 'model-guides', title_zh: 'DeepSeek', title_en: 'DeepSeek', sort: 10, content_zh: normalizeDocTemplateContent(deepseekMd) },
  { slug: 'glm', categorySlug: 'model-guides', title_zh: '智谱 GLM', title_en: 'Zhipu GLM', sort: 20, content_zh: normalizeDocTemplateContent(glmMd) },
  { slug: 'qwen', categorySlug: 'model-guides', title_zh: '通义 Qwen', title_en: 'Qwen', sort: 30, content_zh: normalizeDocTemplateContent(qwenMd) },
  { slug: 'kimi', categorySlug: 'model-guides', title_zh: 'Kimi', title_en: 'Kimi', sort: 40, content_zh: normalizeDocTemplateContent(kimiMd) },
  { slug: 'minimax', categorySlug: 'model-guides', title_zh: 'MiniMax', title_en: 'MiniMax', sort: 50, content_zh: normalizeDocTemplateContent(minimaxMd) },
  { slug: 'doubao-seed', categorySlug: 'model-guides', title_zh: '豆包 Seed', title_en: 'Doubao Seed', sort: 60, content_zh: normalizeDocTemplateContent(doubaoSeedMd) },
  { slug: 'doubao-seedream', categorySlug: 'model-guides', title_zh: '豆包 Seedream 图片', title_en: 'Doubao Seedream Image', sort: 70, content_zh: normalizeDocTemplateContent(doubaoSeedreamMd) },
  { slug: 'seedance-video', categorySlug: 'model-guides', title_zh: 'Seedance 视频', title_en: 'Seedance Video', sort: 80, content_zh: normalizeDocTemplateContent(seedanceVideoMd) },
  { slug: 'seedance-avatar', categorySlug: 'model-guides', title_zh: 'Seedance 2.0 虚拟人', title_en: 'Seedance 2.0 Avatar', sort: 90, content_zh: normalizeDocTemplateContent(seedanceAvatarMd) },
  { slug: 'seedance-portrait', categorySlug: 'model-guides', title_zh: 'Seedance 真人人像', title_en: 'Seedance Portrait', sort: 100, content_zh: normalizeDocTemplateContent(seedancePortraitMd) },
  { slug: 'claude', categorySlug: 'model-guides', title_zh: 'Claude（Anthropic）', title_en: 'Claude (Anthropic)', sort: 110, content_zh: normalizeDocTemplateContent(claudeMd) },
];

export function loadApiReferenceMarkdown(file: string): string {
  const key = file.startsWith('./') ? file : `./${file}`;
  return apiMdModules[key] ?? '';
}

export { API_REFERENCE_ARTICLE_SEEDS, API_REFERENCE_CATEGORY_SEEDS };

export const DOC_CENTER_FIRST_API_ARTICLE_SLUG = API_REFERENCE_ARTICLE_SEEDS[0]?.slug ?? 'get-account-balance';
