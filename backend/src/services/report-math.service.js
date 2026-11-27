// Formula images are generated locally, never by executing TeX or fetching URLs.
const { mathjax } = require("mathjax-full/js/mathjax.js");
const { TeX } = require("mathjax-full/js/input/tex.js");
const { SVG } = require("mathjax-full/js/output/svg.js");
const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
require("mathjax-full/js/input/tex/ams/AmsConfiguration.js");
const sharp = require("sharp");
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

async function formulaImage(value, display) {
  // A fresh TeX instance isolates macro state. Only base and AMS packages are loaded.
  // Reject stateful definitions and commands that can carry URLs, HTML or external resources.
  if (
    value.length > 8000 ||
    /\\(?:href|url|includegraphics|html\w*|style|class|cssId|require|input|include|def|gdef|edef|xdef|let|newcommand|renewcommand|providecommand|csname)\b/.test(
      value,
    )
  )
    return null;
  try {
    const tex = new TeX({
      packages: ["base", "ams"],
      maxBuffer: 16000,
      maxMacros: 500,
    });
    const document = mathjax.document("", {
      InputJax: tex,
      OutputJax: new SVG({ fontCache: "none" }),
    });
    const node = document.convert(value, {
      display,
      em: 16,
      ex: 8,
      containerWidth: 650,
    });
    const svg = adaptor.outerHTML(adaptor.firstChild(node));
    if (/data-mjx-error/.test(svg)) return null;
    const width = Number(svg.match(/viewBox="[^"]*? ([\d.]+) ([\d.]+)"/)?.[1]);
    const height = Number(svg.match(/viewBox="[^"]*? ([\d.]+) ([\d.]+)"/)?.[2]);
    if (!(width > 0 && height > 0) || width > 1000000 || height > 200000)
      return null;
    // 1000 SVG units per em; 13pt body type, 3x pixel density (~288 DPI).
    const pointsWide = (width / 1000) * 13;
    const pointsHigh = (height / 1000) * 13;
    const scale = Math.min(1, 440 / pointsWide, 580 / pointsHigh);
    const pointWidth = pointsWide * scale,
      pointHeight = pointsHigh * scale;
    const pixelWidth = Math.max(1, Math.ceil(pointWidth * 4));
    const pixelHeight = Math.max(1, Math.ceil(pointHeight * 4));
    const normalized = svg
      .replace(/width="[^"]*"/, `width="${pixelWidth}px"`)
      .replace(/height="[^"]*"/, `height="${pixelHeight}px"`);
    return {
      buffer: await sharp(Buffer.from(normalized)).png().toBuffer(),
      width: pointWidth,
      height: pointHeight,
      source: value,
      display,
    };
  } catch {
    return null;
  }
}

async function parseMathMarkdown(source) {
  const [
    { unified },
    { default: remarkParse },
    { default: remarkGfm },
    { default: remarkMath },
    { normalizeMath },
  ] = await Promise.all([
    import("unified"),
    import("remark-parse"),
    import("remark-gfm"),
    import("remark-math"),
    import("../utils/normalizeMath.mjs"),
  ]);
  const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  const tree = parser.parse(normalizeMath(source));
  // Per-document cache is bounded by this report and discarded after export.
  const cache = new Map();
  async function mathRun(node) {
    const key = node.type + node.value;
    if (!cache.has(key))
      cache.set(key, formulaImage(node.value, node.type === "math"));
    const image = await cache.get(key);
    return image
      ? { text: "", math: image }
      : {
          text: "[Công thức không hợp lệ hoặc không được hỗ trợ]",
          italics: true,
        };
  }
  async function runs(nodes = [], style = {}) {
    const output = [];
    for (const node of nodes) {
      if (node.type === "inlineMath" || node.type === "math")
        output.push({ ...style, ...(await mathRun(node)) });
      else if (node.type === "strong")
        output.push(...(await runs(node.children, { ...style, bold: true })));
      else if (node.type === "emphasis")
        output.push(
          ...(await runs(node.children, { ...style, italics: true })),
        );
      else if (node.type === "link") {
        let url;
        try {
          const parsed = new URL(node.url);
          if (
            ["http:", "https:"].includes(parsed.protocol) &&
            !parsed.username &&
            !parsed.password
          )
            url = parsed.href;
        } catch {
          /* unsafe link remains plain text */
        }
        output.push(...(await runs(node.children, { ...style, url })));
      } else if (node.type === "html") continue;
      else if (node.children)
        output.push(...(await runs(node.children, style)));
      else
        output.push({
          ...style,
          text: node.type === "break" ? "\n" : node.value || node.alt || "",
        });
    }
    return output;
  }
  async function blocks(nodes, options = {}) {
    const output = [];
    for (const node of nodes) {
      if (["html", "definition"].includes(node.type)) continue;
      if (node.type === "list") {
        for (const [index, item] of node.children.entries()) {
          const children = await blocks(item.children, {
            ...options,
            indent: (options.indent || 0) + 1,
          });
          if (children[0])
            children[0].prefix = node.ordered
              ? `${(node.start || 1) + index}. `
              : "• ";
          output.push(...children);
        }
      } else if (node.type === "blockquote")
        output.push(
          ...(await blocks(node.children, { ...options, quote: true })),
        );
      else if (node.type === "table") {
        const rows = [];
        for (const row of node.children)
          rows.push(
            await Promise.all(row.children.map((cell) => runs(cell.children))),
          );
        output.push({
          ...options,
          table: { header: rows[0], rows: rows.slice(1) },
          runs: [],
        });
      } else
        output.push({
          ...options,
          ...(node.type === "heading" ? { level: node.depth } : {}),
          ...(node.type === "code" ? { code: true } : {}),
          runs:
            node.type === "math"
              ? [await mathRun(node)]
              : node.children
                ? await runs(node.children)
                : [{ text: node.value || "" }],
        });
    }
    return output;
  }
  return blocks(tree.children);
}
module.exports = { parseMathMarkdown, formulaImage };
