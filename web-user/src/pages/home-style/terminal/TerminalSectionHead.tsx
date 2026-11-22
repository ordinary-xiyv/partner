import React from 'react';
import './terminal.css';

/**
 * B 风格的区块标题。
 *
 * 终端语言里的「段落标记」不是序号，而是一个大写的短标签
 * （ROUTING / GATEWAY / OBSERVE 这种）。前面带一条短横线，
 * 让它看起来像是命令行里的一个区段注释。
 */
export function TerminalSectionHead({
  label,
  title,
  desc,
  id,
}: {
  label: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="tm-head">
      <div className="tm-head__label tm-mono">{label}</div>
      <h2 className="tm-head__title" id={id}>{title}</h2>
      {desc ? <p className="tm-head__desc">{desc}</p> : null}
    </div>
  );
}
