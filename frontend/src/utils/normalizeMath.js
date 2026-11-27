import { unified } from 'unified';
import remarkParse from 'remark-parse';

// Kept identical in backend/src/utils/normalizeMath.mjs: independent Docker contexts.
const parser = unified().use(remarkParse);
function protectedSpans(node, spans = []) {
  if (['code', 'inlineCode', 'html', 'link', 'image', 'definition'].includes(node.type)) {
    spans.push([node.position.start.offset, node.position.end.offset]);
  } else node.children?.forEach((child) => protectedSpans(child, spans));
  return spans;
}
function escaped(source, index) {
  let slashes = 0;
  while (source[--index] === '\\') slashes++;
  return slashes % 2 === 1;
}

export function normalizeMath(source = '') {
  const spans = protectedSpans(parser.parse(source));
  let result = '',
    i = 0,
    span = 0;
  while (i < source.length) {
    if (spans[span]?.[0] === i) {
      result += source.slice(i, spans[span][1]);
      i = spans[span++][1];
      continue;
    }
    const boundary = spans[span]?.[0] ?? source.length;
    const char = source[i];
    if (escaped(source, i)) {
      result += char;
      i++;
      continue;
    }
    const opener = source.startsWith('\\(', i)
      ? '\\('
      : source.startsWith('\\[', i)
        ? '\\['
        : char === '$'
          ? source[i + 1] === '$'
            ? '$$'
            : '$'
          : null;
    if (!opener) {
      result += char;
      i++;
      continue;
    }
    const closer = opener === '\\(' ? '\\)' : opener === '\\[' ? '\\]' : opener;
    let end = source.indexOf(closer, i + opener.length);
    while (end >= 0 && escaped(source, end)) end = source.indexOf(closer, end + closer.length);
    const value = end < 0 ? '' : source.slice(i + opener.length, end);
    const display = opener === '$$' || opener === '\\[';
    const valid =
      end >= 0 &&
      end < boundary &&
      value.trim() &&
      !/\n\s*\n/.test(value) &&
      (display || (!/^\s|\s$/.test(value) && !value.includes('\n'))) &&
      // Two prices must not become one formula. Pure numeric dollar amounts stay text.
      (opener !== '$' ||
        ((!/^\d[\d.,]*(?:\s|$)/.test(value) || /[=+*/^_\\{}<>-]/.test(value)) &&
          !/\d/.test(source[end + 1] || '')));
    if (!valid) {
      result += char === '$' ? '\\$' : char;
      i++;
      continue;
    }
    if (display) {
      // Preserve list/blockquote prefixes; do not introduce rows into GFM tables.
      const lineStart = source.lastIndexOf('\n', i - 1) + 1;
      const prefix = source.slice(lineStart, i);
      const container = /^(?:\s|>)*$/.test(prefix);
      const math = value
        .split('\n')
        .map((line, index) =>
          index && prefix && line.startsWith(prefix) ? line.slice(prefix.length) : line,
        )
        .join('\n')
        .trim();
      result += container
        ? `$$\n${prefix}${math.replace(/\n/g, `\n${prefix}`)}\n${prefix}$$`
        : `$$${value.trim()}$$`;
    } else result += `$${value}$`;
    i = end + closer.length;
  }
  return result;
}
