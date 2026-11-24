#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把文档模板（md + 两个 manifest）编译成伙伴后端的种子 JSON。

为什么要有这个脚本：
种子内容的唯一来源是 backend/scripts/doc_templates/ 下的 md 与 manifest。
改了模板要重跑本脚本，产物 docs_seed.json 一并提交 —— 后端用 go:embed
把它编进二进制，运行时不需要任何外部文件。

★ 这套模板原来放在 web-user 前端（features/doccenter/templates），
  客户站拿它当「接口挂了就显示假文档」的兜底。那个兜底已经删除：
  目录和正文是两条独立的降级链，兜底只补了目录、补不了正文，
  结果就是「左边有目录、右边写文档不存在」。现在模板只作为
  「导入默认文档」的种子来源，放在后端这里。

运行方式（内容有改动时重跑，产物提交进仓库）：
    python3 backend/scripts/gen_doc_seed.py

输入：
    backend/scripts/doc_templates/*.md
    backend/scripts/doc_templates/api-reference/*.md
    backend/scripts/doc_templates/templateContent.ts
    backend/scripts/doc_templates/apiReferenceManifest.ts
输出：
    backend/internal/partner/seed/docs_seed.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TPL_DIR = ROOT / "backend/scripts/doc_templates"
OUT = ROOT / "backend/internal/partner/seed/docs_seed.json"

PRODUCTION_BASE = "https://tokens.lynxtoncloud.com"

# 根分类。id 留空，由后端按 site_id 自增，这里只给 slug 供文章引用。
ROOT_CATEGORIES = [
    {"slug": "getting-started", "parent_slug": "", "title_zh": "入门", "title_en": "Getting Started", "sort": 10},
    {"slug": "model-guides", "parent_slug": "", "title_zh": "模型指南", "title_en": "Model Guides", "sort": 20},
    {"slug": "api-reference", "parent_slug": "", "title_zh": "API 参考", "title_en": "API Reference", "sort": 90},
]


def normalize(content: str) -> str:
    """
    与 templateContent.ts 的 normalizeDocTemplateContent 保持一致。

    把写死的生产域名换成 {{baseUrl}} 占位符 —— 种子进库后由客户站按
    「伙伴配的接口基地址」渲染，两个分销商的文档里就不会都印着主站域名。
    """
    content = content.replace(f"{PRODUCTION_BASE}/v1", "{{baseUrl}}/v1")
    content = content.replace(PRODUCTION_BASE, "{{baseUrl}}")
    return content


def read_md(rel: str) -> str:
    p = TPL_DIR / rel
    if not p.exists():
        sys.exit(f"[gen_doc_seed] 缺少模板文件：{p}")
    return normalize(p.read_text(encoding="utf-8"))


def parse_guide_articles() -> list[dict]:
    """
    解析 templateContent.ts 的 GUIDE_ARTICLE_TEMPLATES。

    md 内容通过 `import varName from './x.md?raw'` 引入，所以要先建立
    变量名 → 文件名的映射，再把数组项里的变量名换成真实内容。
    """
    ts = (TPL_DIR / "templateContent.ts").read_text(encoding="utf-8")

    var_to_file = dict(
        re.findall(r"import\s+(\w+)\s+from\s+'(\.\/[^']+\.md)\?raw'", ts)
    )
    if not var_to_file:
        sys.exit("[gen_doc_seed] templateContent.ts 里没有解析到任何 md import")

    block = re.search(
        r"GUIDE_ARTICLE_TEMPLATES[^=]*=\s*\[(.*?)\n\];", ts, re.S
    )
    if not block:
        sys.exit("[gen_doc_seed] 找不到 GUIDE_ARTICLE_TEMPLATES 数组")

    out: list[dict] = []
    pattern = re.compile(
        r"\{\s*slug:\s*'([^']+)'.*?categorySlug:\s*'([^']+)'"
        r".*?title_zh:\s*'([^']*)'.*?title_en:\s*'([^']*)'"
        r".*?sort:\s*(\d+),\s*content_zh:\s*normalizeDocTemplateContent\((\w+)\)",
        re.S,
    )
    for m in pattern.finditer(block.group(1)):
        slug, cat, tzh, ten, sort, var = m.groups()
        rel = var_to_file.get(var)
        if not rel:
            sys.exit(f"[gen_doc_seed] {slug} 引用的变量 {var} 找不到对应 md 文件")
        out.append({
            "slug": slug,
            "category_slug": cat,
            "title_zh": tzh,
            "title_en": ten,
            "sort": int(sort),
            "content_zh": read_md(rel.lstrip("./")),
        })

    if not out:
        sys.exit("[gen_doc_seed] GUIDE_ARTICLE_TEMPLATES 解析结果为空")
    return out


def parse_api_reference() -> tuple[list[dict], list[dict]]:
    """解析 apiReferenceManifest.ts 的分类与文章种子。"""
    ts = (TPL_DIR / "apiReferenceManifest.ts").read_text(encoding="utf-8")

    cat_block = re.search(
        r"API_REFERENCE_CATEGORY_SEEDS[^=]*=\s*\[(.*?)\n\];", ts, re.S
    )
    art_block = re.search(
        r"API_REFERENCE_ARTICLE_SEEDS[^=]*=\s*\[(.*?)\n\];", ts, re.S
    )
    if not cat_block or not art_block:
        sys.exit("[gen_doc_seed] 找不到 API_REFERENCE_* 数组")

    cat_pat = re.compile(
        r"\{\s*slug:\s*'([^']+)',\s*parentSlug:\s*'([^']+)'"
        r",\s*title_zh:\s*\"([^\"]*)\",\s*title_en:\s*\"([^\"]*)\",\s*sort:\s*(\d+)"
    )
    cats = [
        {
            "slug": m.group(1),
            "parent_slug": m.group(2),
            "title_zh": m.group(3),
            "title_en": m.group(4),
            "sort": int(m.group(5)),
        }
        for m in cat_pat.finditer(cat_block.group(1))
    ]

    art_pat = re.compile(
        r"\{\s*slug:\s*'([^']+)',\s*categorySlug:\s*'([^']+)'"
        r",\s*title_zh:\s*\"([^\"]*)\",\s*title_en:\s*\"([^\"]*)\""
        r",\s*sort:\s*(\d+),\s*file:\s*'(\./api-reference/[^']+)'"
    )
    arts = []
    for m in art_pat.finditer(art_block.group(1)):
        slug, cat, tzh, ten, sort, rel = m.groups()
        arts.append({
            "slug": slug,
            "category_slug": cat,
            "title_zh": tzh,
            "title_en": ten,
            "sort": int(sort),
            "content_zh": read_md(rel[len("./"):]),
        })

    if not cats or not arts:
        sys.exit(
            f"[gen_doc_seed] 解析结果异常：分类 {len(cats)} 条、文章 {len(arts)} 条"
        )
    return cats, arts


def main() -> None:
    guide_articles = parse_guide_articles()
    api_cats, api_articles = parse_api_reference()

    categories = [dict(c) for c in ROOT_CATEGORIES] + api_cats
    articles = guide_articles + api_articles

    # 自检：每篇文章的分类都必须存在，否则后端导入时会整批失败
    known = {c["slug"] for c in categories}
    for a in articles:
        if a["category_slug"] not in known:
            sys.exit(
                f"[gen_doc_seed] 文章 {a['slug']} 的分类 "
                f"{a['category_slug']} 不在分类列表里"
            )

    # 自检：slug 不能重复（后端有 (site_id, slug) 唯一索引）
    for kind, items in (("分类", categories), ("文章", articles)):
        slugs = [i["slug"] for i in items]
        dup = {s for s in slugs if slugs.count(s) > 1}
        if dup:
            sys.exit(f"[gen_doc_seed] {kind} slug 重复：{sorted(dup)}")

    payload = {
        "version": 1,
        "categories": categories,
        "articles": articles,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    total = sum(len(a["content_zh"]) for a in articles)
    print(f"已生成 {OUT}")
    print(f"  分类 {len(categories)} 条、文章 {len(articles)} 条、正文共 {total} 字符")


if __name__ == "__main__":
    main()
