import React from 'react';
import './editorial.css';

/**
 * A 风格的区块标题。
 *
 * 编辑物的版面惯例：左边大标题、右边一段说明，两者用一条底线收在一起。
 * 序号（01 / 02）是主色在这套设计里唯一允许出现的地方之一 ——
 * 它小、位置固定、不影响阅读，所以即便主色很浅也不会出问题
 * （而且走的是派生后的 --ed-brand-on-surface）。
 */
export function EditorialSectionHead({
  index,
  title,
  desc,
}: {
  index: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
}) {
  return (
    <div className="ed-section-head">
      <div>
        <div className="ed-section-head__index ed-mono">{index}</div>
        <h2 className="ed-section-head__title ed-serif">{title}</h2>
      </div>
      {desc ? <p className="ed-section-head__desc">{desc}</p> : null}
    </div>
  );
}
