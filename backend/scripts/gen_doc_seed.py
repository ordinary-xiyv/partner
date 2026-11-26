#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把默认文档模板编译成伙伴后端的种子 JSON。

为什么要有这个脚本：
种子内容的唯一来源是 backend/scripts/doc_templates/ 下的 md 与 manifest.json。
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
    backend/scripts/doc_templates/manifest.json   —— 分类与文章清单
    backend/scripts/doc_templates/**/*.md         —— 正文，路径见清单
输出：
    backend/internal/partner/seed/docs_seed.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TPL_DIR = ROOT / "backend/scripts/doc_templates"
MANIFEST = TPL_DIR / "manifest.json"
OUT = ROOT / "backend/internal/partner/seed/docs_seed.json"

PRODUCTION_BASE = "https://tokens.lynxtoncloud.com"


def normalize(content: str) -> str:
    """
    兜底再替换一次生产域名。

    作者写 md 时手滑粘贴了主站域名是很常见的事，模板清洗阶段已经替换过，
    这里再兜一次 —— 多一道替换的成本是零，漏一次就是分销商的文档把
    客户引到主站。与前端 normalizeDocTemplateContent 的语义保持一致。
    """
    content = content.replace(f"{PRODUCTION_BASE}/v1", "{{baseUrl}}/v1")
    content = content.replace(PRODUCTION_BASE, "{{baseUrl}}")
    return content


def read_md(rel: str) -> str:
    p = TPL_DIR / rel
    if not p.exists():
        sys.exit(f"[gen_doc_seed] 缺少模板文件：{p}")
    return normalize(p.read_text(encoding="utf-8"))


def load_manifest() -> tuple[list[dict], list[dict]]:
    if not MANIFEST.exists():
        sys.exit(f"[gen_doc_seed] 缺少清单：{MANIFEST}")
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"[gen_doc_seed] 清单不是合法 JSON：{exc}")

    categories = data.get("categories") or []
    articles = data.get("articles") or []
    if not categories or not articles:
        sys.exit("[gen_doc_seed] 清单里的分类或文章为空")

    out = []
    for a in articles:
        for key in ("slug", "category_slug", "title_zh", "title_en", "file", "sort"):
            if key not in a:
                sys.exit(f"[gen_doc_seed] 文章 {a.get('slug', '?')} 缺字段 {key}")
        out.append({
            "slug": a["slug"],
            "category_slug": a["category_slug"],
            "title_zh": a["title_zh"],
            "title_en": a["title_en"],
            "sort": int(a["sort"]),
            "content_zh": read_md(a["file"]),
        })
    return categories, out


def main() -> None:
    categories, articles = load_manifest()

    # 自检：每篇文章的分类都必须存在，否则后端导入时会整批失败
    known = {c["slug"] for c in categories}
    for a in articles:
        if a["category_slug"] not in known:
            sys.exit(
                f"[gen_doc_seed] 文章 {a['slug']} 的分类 "
                f"{a['category_slug']} 不在分类列表里"
            )

    # 自检：父分类必须存在，且不能指向自己
    for c in categories:
        parent = c.get("parent_slug") or ""
        if parent and parent not in known:
            sys.exit(f"[gen_doc_seed] 分类 {c['slug']} 的父级 {parent} 不存在")
        if parent == c["slug"]:
            sys.exit(f"[gen_doc_seed] 分类 {c['slug']} 的父级指向自己")

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
