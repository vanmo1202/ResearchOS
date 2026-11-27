const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const db = require("../src/config/database");
const runs = require("../src/services/run.service");
const runner = require("../src/workers/runner");
const provider = require("../src/providers/research.provider");
after(() => db.close());
const passage =
  "Simple harmonic motion occurs when the restoring force is proportional to displacement. A mass on a spring obeys Hooke law and oscillates with a period determined by its mass and spring constant. The differential equation describes displacement, velocity, acceleration, and mechanical energy.";
test("WF01 six-stage worker persists multi-paragraph report and verifies every paragraph", async () => {
  await db.initializeDatabase();
  const owner = randomUUID(),
    requestId = randomUUID();
  await db.run(
    "INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES($1,$2,'Fixture','unused',now(),now())",
    [owner, owner + "@test.invalid"],
  );
  await db.run(
    "INSERT INTO requests(id,owner_id,topic,goal,output_length) VALUES($1,$2,'Simple harmonic motion','Explain restoring force','long')",
    [requestId, owner],
  );
  const run = await runs.create(
    requestId,
    { searchMore: false },
    "create-quality",
  );
  const questions = [
    { id: "Q1", question: "References for restoring force?" },
    { id: "Q2", question: "What determines the period?" },
  ];
  const customProvider = {
    ...provider,
    plan: async () => ({
      researchQuestions: questions,
      searchQueries: questions.map((q) => ({
        questionId: q.id,
        query: q.question,
      })),
    }),
    collect: async (ctx) => ({
      sources: [
        "https://openstax.org/physics",
        "https://physics.mit.edu/oscillations",
      ].map((url) => ({
        id: randomUUID(),
        run_id: ctx.run.id,
        query: "Simple harmonic motion",
        title: "Physics fixture",
        url,
        normalized_url: url,
        provider: "tavily",
        original_content: passage,
        display_content_vi: null,
        content_hash: provider.hash(passage),
        language: "en",
        translation_status: "pending",
        collected_at: new Date().toISOString(),
        provenance: { httpStatus: 200 },
      })),
      warnings: [],
    }),
    extract: async (ctx) => ({
      evidence: questions.map((q, i) => ({
        id: randomUUID(),
        runId: ctx.run.id,
        questionId: q.id,
        researchQuestion: q.question,
        sourceVersionId: ctx.sources[i].id,
        sourceId: ctx.sources[i].id,
        chunkId: ctx.chunks.find(
          (c) => c.source_version_id === ctx.sources[i].id,
        ).id,
        originalQuote: passage.split(". ")[i] + ".",
        evidenceText: passage.split(". ")[i] + ".",
        reason: "Exact source passage",
        relevanceScore: 1,
        conflicting: false,
        verificationStatus: "unverified",
      })),
      warnings: [],
    }),
    json: async (_ctx, _prompt, input) =>
      input.claims
        ? {
            verdicts: input.claims.map((c) => ({
              claimId: c.claimId,
              status: "verified",
            })),
          }
        : {
            claims: input.evidence.flatMap((e) => [
              { evidenceId: e.evidenceId, kind: "explanation", text: e.quote },
              {
                evidenceId: e.evidenceId,
                kind: "conclusion",
                text: "The source states: " + e.quote,
              },
            ]),
          },
  };
  for (let i = 0; i < 6; i++)
    assert.equal(await runner.runOnce({ customProvider }), true);
  const progress = await runs.progress(requestId, run.id);
  assert.equal(progress.status, "completed");
  assert.equal(progress.percent, 100);
  assert.equal(progress.evidenceCount, 2);
  const report = await db.get("SELECT * FROM report_versions WHERE run_id=$1", [
    run.id,
  ]);
  const refs = JSON.parse(report.references_json),
    validation = JSON.parse(report.citation_validation_json);
  assert.equal(refs.flatMap((r) => r.claims).length, 4);
  assert.equal(validation.claimVerdicts.length, 4);
  assert.equal(validation.valid, true);
  assert.match(report.content, /Dàn ý/);
  assert.match(report.content, /Giải thích chuyên sâu/);
  const exporter = require("../src/services/run-export.service");
  const { unzipSync, strFromU8 } = require("fflate");
  const { writeFile } = require("node:fs/promises");
  const docx = await exporter.exportReport(report.id, "docx");
  const xml = strFromU8(unzipSync(docx.buffer)["word/document.xml"]);
  assert.match(xml, /Dàn ý/);
  assert.match(xml, /Giải thích chuyên sâu/);
  for (const ref of refs)
    for (const claim of ref.claims) assert.ok(xml.includes(claim.text));
  const pdf = await exporter.exportReport(report.id, "pdf");
  assert.equal(pdf.buffer.subarray(0, 5).toString(), "%PDF-");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: new Uint8Array(pdf.buffer) })
    .promise;
  let pdfText = "";
  for (let i = 1; i <= document.numPages; i++)
    pdfText += (await (await document.getPage(i)).getTextContent()).items
      .map((item) => item.str)
      .join(" ");
  assert.match(pdfText, /Dàn ý/);
  assert.match(pdfText, /restoring force/);
  await document.destroy();
  await writeFile("/tmp/wf01-quality-report.docx", docx.buffer);
  await writeFile("/tmp/wf01-quality-report.pdf", pdf.buffer);
  await writeFile("/tmp/wf01-quality-report.md", report.content);
  // A later verification retry must still refuse newly introduced prose.
  await db.run(
    "UPDATE report_versions SET content=content || E'\\nInvented claim [1]' WHERE id=$1",
    [report.id],
  );
  const ctx = await runner.context(
    { run_id: run.id },
    new AbortController().signal,
    customProvider,
  );
  const rejected = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(rejected.valid, false);
  assert.equal(rejected.status, "partial");
  assert.ok(rejected.reasonCodes.includes("UNREGISTERED_REPORT_CONTENT"));
});
