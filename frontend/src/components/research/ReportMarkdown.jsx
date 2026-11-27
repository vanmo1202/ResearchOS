import { useEffect, useId, useRef, useState } from 'react';
import RichContentRenderer from '../ui/RichContentRenderer';
export default function ReportMarkdown({ children }) {
  const content = useRef(null),
    prefix = useId().replace(/:/g, ''),
    [outline, setOutline] = useState([]);
  useEffect(() => {
    const headings = [...content.current.querySelectorAll('h1,h2,h3')];
    setOutline(
      headings.map((heading, index) => {
        heading.id = `${prefix}-section-${index}`;
        return { id: heading.id, text: heading.textContent };
      }),
    );
  }, [children, prefix]);
  return (
    <>
      {outline.length > 1 && (
        <details className="studio-report-toc">
          <summary>Mục lục báo cáo</summary>
          <ol>
            {outline.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.text}</a>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div ref={content} className="report-markdown-content">
        <RichContentRenderer>{children}</RichContentRenderer>
      </div>
    </>
  );
}
