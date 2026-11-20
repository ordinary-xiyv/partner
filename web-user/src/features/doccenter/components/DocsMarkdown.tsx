import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css';
import DocsCodeBlock from './DocsCodeBlock';
import { slugifyHeading } from '../utils/slugifyHeading';
import './docs-shell.css';

interface DocsMarkdownProps {
  content: string;
}

function getNodeText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getNodeText).join('');
  if (React.isValidElement(children)) return getNodeText(children.props.children);
  return '';
}

export default function DocsMarkdown({ content }: DocsMarkdownProps) {
  return (
    <div className="docs-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h2: ({ children, ...props }) => {
            const id = slugifyHeading(getNodeText(children));
            return (
              <h2 id={id} {...props}>
                {children}
              </h2>
            );
          },
          h3: ({ children, ...props }) => {
            const id = slugifyHeading(getNodeText(children));
            return (
              <h3 id={id} {...props}>
                {children}
              </h3>
            );
          },
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className ?? '');
            if (isBlock) {
              return (
                <DocsCodeBlock className={className}>
                  {getNodeText(children).replace(/\n$/, '')}
                </DocsCodeBlock>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          img: ({ alt, ...props }) => (
            <img alt={alt ?? ''} loading="lazy" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
