const path = require("node:path");
const PDFDocument = require("pdfkit");
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

function renderPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 56, bottom: 56, left: 64, right: 56 },
      info: { Title: data.report.title, Author: "ResearchOS" },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const bottom = () => doc.page.height - 56;
    const pageWidth = doc.page.width - 120;
    const fonts = path.join(__dirname, "../../assets/fonts");
    for (const [name, file] of [
      ["regular", "Regular"],
      ["bold", "Bold"],
      ["italic", "Italic"],
      ["bolditalic", "BoldItalic"],
    ])
      doc.registerFont(name, path.join(fonts, `LiberationSerif-${file}.ttf`));
    function font(run, size) {
      doc
        .font(
          run.bold
            ? run.italics
              ? "bolditalic"
              : "bold"
            : run.italics
              ? "italic"
              : "regular",
        )
        .fontSize(size);
    }
    function layout(runs, width, size, maxMathHeight = 500) {
      const lines = [];
      let items = [],
        used = 0,
        height = size * 1.6;
      function flush() {
        if (items.length) lines.push({ items, height });
        items = [];
        used = 0;
        height = size * 1.6;
      }
      for (const run of runs) {
        if (run.math) {
          const ratio = Math.min(
            1,
            width / run.math.width,
            maxMathHeight / run.math.height,
          );
          const item = {
            ...run,
            width: run.math.width * ratio,
            height: run.math.height * ratio,
          };
          if (run.math.display) flush();
          if (used + item.width > width) flush();
          items.push({
            ...item,
            x: run.math.display ? (width - item.width) / 2 : used,
          });
          used += item.width;
          height = Math.max(height, item.height + 8);
          if (run.math.display) flush();
          continue;
        }
        font(run, size);
        const parts = String(run.text || "")
          .split(/(\n|[^\S\n]+|[^\s]+)/)
          .filter(Boolean);
        for (const part of parts) {
          if (part === "\n") {
            flush();
            continue;
          }
          const wordWidth = doc.widthOfString(part);
          if (used + wordWidth > width) flush();
          if (!used && /^\s+$/.test(part)) continue;
          // Split a long URL/identifier without allowing page-wide overflow.
          let piece = "";
          for (const char of part) {
            if (doc.widthOfString(piece + char) > width) {
              items.push({ ...run, text: piece, x: 0 });
              flush();
              piece = "";
            }
            piece += char;
          }
          const w = doc.widthOfString(piece);
          items.push({ ...run, text: piece, x: used });
          used += w;
        }
      }
      flush();
      return lines;
    }
    function drawLine(line, x, y, size) {
      for (const item of line.items) {
        if (item.math)
          doc.image(
            item.math.buffer,
            x + item.x,
            y + (line.height - item.height) / 2,
            { width: item.width, height: item.height },
          );
        else {
          font(item, size);
          const url = safeUrl(item.url);
          doc
            .fillColor(url ? "#174b85" : "#17202a")
            .text(item.text, x + item.x, y + (line.height - size * 1.2) / 2, {
              lineBreak: false,
              ...(url ? { link: url, underline: true } : {}),
            });
        }
      }
    }
    let cursor = 56;
    function newPage() {
      doc.addPage();
      cursor = 56;
    }
    function paragraph(runs, { size = 12, indent = 0, heading = false } = {}) {
      if (heading && cursor + 70 > bottom()) newPage();
      const lines = layout(runs, pageWidth - indent, size);
      for (const line of lines) {
        if (cursor + line.height > bottom()) newPage();
        drawLine(line, 64 + indent, cursor, size);
        cursor += line.height;
      }
      cursor += size * 0.6;
    }
    function table(block) {
      const columns = Math.max(1, block.table.header.length);
      const width = pageWidth / columns,
        padding = 7,
        size = 11;
      const rows = [block.table.header, ...block.table.rows];
      const headerCells = block.table.header.map((runs) =>
        layout(
          runs.map((run) => ({ ...run, bold: true })),
          width - padding * 2,
          size,
        ),
      );
      const headerLineCount = Math.max(
        1,
        ...headerCells.map((cell) => cell.length),
      );
      let headerHeight = 0;
      for (let i = 0; i < headerLineCount; i++)
        headerHeight +=
          Math.max(
            size * 1.6,
            ...headerCells.map((cell) => cell[i]?.height || 0),
          ) +
          padding * 2;
      const printableHeight = bottom() - 56;
      // An oversized header is printed once; repeating it would leave no room for data.
      const repeatHeader = headerHeight <= printableHeight / 3;
      const maxMathHeight =
        printableHeight - (repeatHeader ? headerHeight : 0) - padding * 2 - 8;
      function drawRow(row, header) {
        const cells = header
          ? headerCells
          : row.map((runs) =>
              layout(runs, width - padding * 2, size, maxMathHeight),
            );
        const count = Math.max(1, ...cells.map((cell) => cell.length));
        // Draw row fragments by line, allowing even a very tall cell to paginate safely.
        for (let i = 0; i < count; i++) {
          const height =
            Math.max(size * 1.6, ...cells.map((cell) => cell[i]?.height || 0)) +
            padding * 2;
          if (cursor + height > bottom()) {
            newPage();
            if (!header && repeatHeader) drawRow(block.table.header, true);
          }
          for (let column = 0; column < columns; column++) {
            const x = 64 + column * width;
            doc
              .save()
              .rect(x, cursor, width, height)
              .fillAndStroke(header ? "#eef3ef" : "#ffffff", "#b9c8bd")
              .restore();
            if (cells[column]?.[i])
              drawLine(cells[column][i], x + padding, cursor + padding, size);
          }
          cursor += height;
        }
      }
      for (const [index, row] of rows.entries()) drawRow(row, index === 0);
      cursor += 10;
    }
    try {
      paragraph([{ text: data.report.title, bold: true }], {
        size: 20,
        heading: true,
      });
      paragraph([{ text: `Chủ đề: ${data.request.topic}` }]);
      paragraph([{ text: `Ngày tạo: ${data.created}` }]);
      for (const block of data.body) {
        if (block.tableContinuation) continue;
        if (block.table) table(block);
        else
          paragraph(
            [
              ...(block.prefix ? [{ text: block.prefix }] : []),
              ...block.runs.map((run) => ({
                ...run,
                bold: Boolean(block.level || run.bold),
              })),
            ],
            {
              size: block.level ? Math.max(13, 19 - block.level) : 12,
              heading: Boolean(block.level),
              indent:
                block.indent || block.quote ? 18 * (block.indent || 1) : 0,
            },
          );
      }
      paragraph([{ text: "Tài liệu tham khảo", bold: true }], {
        size: 17,
        heading: true,
      });
      for (const ref of data.references)
        paragraph([
          { text: `${ref.citationLabel} ${ref.title} — ` },
          { text: ref.url, url: safeUrl(ref.url) },
        ]);
      doc.end();
    } catch (error) {
      doc.destroy(error);
    }
  });
}
module.exports = { renderPdf };
