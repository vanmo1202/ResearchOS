import { memo, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { safeExternalUrl } from '../../utils/format';
import { normalizeMath } from '../../utils/normalizeMath';
import './rich-content.css';

function softBreaks() {
  return function walk(node) {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type !== 'text' || !child.value.includes('\n')) {
        walk(child);
        return [child];
      }
      return child.value
        .split('\n')
        .flatMap((value, index) =>
          index ? [{ type: 'break' }, { type: 'text', value }] : [{ type: 'text', value }],
        );
    });
  };
}
function guardMath() {
  return function walk(node) {
    if (
      ['math', 'inlineMath'].includes(node.type) &&
      /\\(?:def|gdef|edef|xdef|let|newcommand|renewcommand|providecommand|csname|require|input|include)\b/.test(
        node.value,
      )
    ) {
      node.type = 'text';
      node.value = '[Công thức không được hỗ trợ]';
      delete node.data;
    }
    node.children?.forEach(walk);
  };
}
const remarkPlugins = [remarkGfm, remarkMath, guardMath, softBreaks];
const rehypePlugins = [
  [
    rehypeKatex,
    {
      trust: false,
      strict: 'error',
      maxExpand: 500,
      maxSize: 20,
      errorColor: '#9b3030',
    },
  ],
];
const components = {
  a: ({ children, href }) => {
    const safe = safeExternalUrl(href);
    return safe ? (
      <a href={safe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
  // AI images are not fetched: prevents tracking and preserves text-only academic output.
  img: ({ alt }) => <span>{alt}</span>,
  table: ({ children, ...props }) => {
    const { node: _node, ...attributes } = props;
    return (
      <div className="rich-table-scroll" role="region" aria-label="Bảng dữ liệu" tabIndex={0}>
        <table {...attributes}>{children}</table>
      </div>
    );
  },
};

export default memo(function RichContentRenderer({ children = '', className = '' }) {
  const markdown = useMemo(() => normalizeMath(String(children)), [children]);
  const content = useRef(null);
  const [source, setSource] = useState(null);
  function copyMath() {
    const values = [
      ...content.current.querySelectorAll('annotation[encoding="application/x-tex"], .katex-error'),
    ].map((node) => node.textContent);
    const value = values.length ? values.join('\n\n') : String(children);
    setSource(value);
    navigator.clipboard?.writeText(value).catch(() => {});
  }
  return (
    <div className={`rich-content ${className}`}>
      <div ref={content}>
        <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          components={components}
          skipHtml
        >
          {markdown}
        </ReactMarkdown>
      </div>
      <div className="rich-source-tools">
        <button type="button" onClick={copyMath}>
          Sao chép LaTeX
        </button>
        {source !== null && (
          <label>
            Mã nguồn LaTeX
            <textarea
              aria-label="Mã nguồn LaTeX"
              readOnly
              value={source}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        )}
      </div>
    </div>
  );
});
