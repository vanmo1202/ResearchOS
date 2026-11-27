const { test } = require("node:test");
const assert = require("node:assert/strict");
const { unzipSync, strFromU8 } = require("fflate");
const {
  renderDocx,
  renderPdf,
} = require("../src/services/report-export.service");

async function fixture() {
  const { parseMathMarkdown } = require("../src/services/report-math.service");
  return {
    report: { title: "Công thức tiếng Việt" },
    request: { topic: "Xác suất và vật lý" },
    created: "28/11/2026",
    references: [
      {
        citationLabel: "[Nguồn 1]",
        title: "Bằng chứng",
        url: "https://example.org/source",
      },
    ],
    body: await parseMathMarkdown(String.raw`## Phương pháp

Năng lượng $E=mc^2$ và \(\sqrt{x}\). Giá $5 và $10.

$$\begin{bmatrix}1&2\\3&4\end{bmatrix}$$

\[\begin{aligned}a&=b+c\\d&=e+f\end{aligned}\]

| Tiêu chí | Giá trị |
| --- | --- |
| Phân số | $\frac{a}{b}$ |

- Thống kê $\sum_{i=1}^n i$

Lỗi $\frac{1}{$ vẫn giữ văn bản tiếp theo.

$\href{https://evil.example}{x}$
`),
  };
}
test("DOCX embeds isolated high resolution formulas and real tables without raw LaTeX or external math links", async () => {
  const data = await fixture();
  const buffer = await renderDocx(data);
  const zip = unzipSync(buffer);
  const xml = strFromU8(zip["word/document.xml"]);
  assert.match(xml, /<w:drawing>/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /Giá \$5 và \$10/);
  assert.match(xml, /vẫn giữ văn bản tiếp theo/);
  assert.doesNotMatch(
    xml.replace(/descr="[^"]*"/g, ""),
    /\\begin|\\frac|E=mc\^2/,
  );
  const images = Object.entries(zip).filter(([name]) =>
    /word\/media\/.*\.png$/.test(name),
  );
  assert.ok(images.length >= 6);
  assert.ok(images.every(([, bytes]) => bytes[0] === 137 && bytes[1] === 80));
  assert.doesNotMatch(
    strFromU8(zip["word/_rels/document.xml.rels"]),
    /evil.example/,
  );
});
test("PDF embeds formula images, Unicode text, table borders and safe citations", async () => {
  const buffer = await renderPdf(await fixture());
  const raw = buffer.toString("latin1");
  assert.equal(raw.slice(0, 5), "%PDF-");
  assert.match(raw, /\/Subtype \/Image/);
  assert.match(raw, /FontFile2/);
  assert.match(raw, /ToUnicode/);
  assert.match(raw, /https:\/\/example.org\/source/);
  assert.doesNotMatch(raw, /evil.example/);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ");
  assert.match(text, /Công thức tiếng Việt/);
  assert.match(text, /Tiêu chí/);
  assert.match(text, /vẫn giữ văn bản tiếp theo/);
  assert.doesNotMatch(text, /\\begin|\\frac|E=mc\^2/);
  await pdf.destroy();
});
test("display and table formulas fit DOCX content and cell widths", async () => {
  const { parseMathMarkdown } = require("../src/services/report-math.service");
  const data = await fixture();
  data.body = await parseMathMarkdown(
    "$$" +
      "x+".repeat(80) +
      "y$$\n\n| A | B |\n| --- | --- |\n| $" +
      "x+".repeat(80) +
      "y$ | Nội dung |",
  );
  const zip = unzipSync(await renderDocx(data));
  const xml = strFromU8(zip["word/document.xml"]);
  const table = xml.slice(xml.indexOf("<w:tbl>"), xml.indexOf("</w:tbl>"));
  const widths = [...table.matchAll(/wp:extent cx="(\d+)"/g)].map((match) =>
    Number(match[1]),
  );
  assert.ok(widths.length > 0);
  assert.ok(
    widths.every((width) => width <= 210 * 12700),
    "formula fits within one of two columns",
  );
  assert.match(xml.slice(0, xml.indexOf("<w:tbl>")), /<w:jc w:val="center"/);
});
test("WF01 saved version export uses real formula renderer without accessing a database or providers", async (t) => {
  const db = require("../src/config/database");
  const content = "## Kết quả\n\n$E=mc^2$\n\n## Tài liệu tham khảo\n\nNguồn cũ";
  t.mock.method(db, "get", async (sql) =>
    sql.includes("report_versions")
      ? {
          id: "report-one",
          run_id: "run-one",
          content,
          references_json: "[]",
          created_at: "2026-11-28",
        }
      : {
          input_snapshot_json: JSON.stringify({ topic: "Nghiên cứu Việt Nam" }),
        },
  );
  const { exportReport } = require("../src/services/run-export.service");
  const result = await exportReport("report-one", "docx");
  const zip = unzipSync(result.buffer);
  assert.match(strFromU8(zip["word/document.xml"]), /<w:drawing>/);
  assert.equal(result.filename, "research-report-one.docx");
  assert.equal(db.get.mock.calls.length, 2);
});
test("legacy saved report export preserves canonical references and returns formatted math without mutations", async (t) => {
  const requests = require("../src/models/request.model");
  const reports = require("../src/services/report.service");
  const sources = require("../src/models/source.model");
  const snapshot = {
    title: "Báo cáo toán học",
    content:
      "# Báo cáo toán học\n\n## Kết quả\n\n$E=mc^2$\n\n## Tài liệu tham khảo\n\nNguồn cũ",
    createdAt: "2026-11-28 00:00:00",
    references: [
      {
        citationLabel: "[Nguồn 1]",
        title: "Original",
        url: "https://example.org/source",
      },
    ],
  };
  const original = JSON.stringify(snapshot);
  t.mock.method(requests, "findById", async () => ({
    id: "saved-one",
    topic: "Vật lý",
  }));
  t.mock.method(reports, "getReport", async () => snapshot);
  t.mock.method(sources, "getSourcesByRequestId", async () => [
    { titleVi: "Nguồn tiếng Việt", url: "https://example.org/source" },
  ]);
  t.mock.method(global, "fetch", () => {
    throw new Error("No network during export");
  });
  const { exportReport } = require("../src/services/report-export.service");
  const result = await exportReport("saved-one", "docx");
  const xml = strFromU8(unzipSync(result.buffer)["word/document.xml"]);
  assert.match(xml, /<w:drawing>/);
  assert.match(xml, /Nguồn tiếng Việt/);
  assert.doesNotMatch(xml, /Nguồn cũ/);
  assert.equal(result.filename, "Bao_cao_nghien_cuu_saved-on.docx");
  assert.equal(JSON.stringify(snapshot), original);
});
test("PDF keeps tall table header and body matrices inside the printable page", async () => {
  const { parseMathMarkdown } = require("../src/services/report-math.service");
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const matrix =
    String.raw`\begin{bmatrix}` +
    Array(30).fill("x").join("\\\\") +
    String.raw`\end{bmatrix}`;
  const data = await fixture();
  data.body = await parseMathMarkdown(
    `| $${matrix}$ |\n| --- |\n| $${matrix}$ |`,
  );
  const buffer = await renderPdf(data);
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const operators = await page.getOperatorList();
    for (let i = 0; i < operators.fnArray.length; i++) {
      // PDFKit uses [width, 0, 0, -height, x, y+height] before painting each image.
      if (operators.fnArray[i] === OPS.transform) {
        const [a, b, c, d, x, y] = operators.argsArray[i];
        if (a > 10 && b === 0 && c === 0 && d < -10) {
          assert.ok(
            y <= page.view[3] - 56 + 0.01,
            `image bottom ${y} stays above lower margin`,
          );
        }
      }
    }
  }
  await pdf.destroy();
});
