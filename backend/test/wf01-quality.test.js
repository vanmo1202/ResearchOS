const { test } = require("node:test");
const assert = require("node:assert/strict");
const provider = require("../src/providers/research.provider");
const quality = require("../src/services/source-quality.service");
const topic = {
  topic: "Dao động điều hòa",
  goal: "Ứng dụng và phương pháp giải bài tập",
  language: "vi",
  numberOfSources: 3,
};
const text =
  "Simple harmonic motion occurs when the restoring force is proportional to displacement. A mass on a spring obeys Hooke law and oscillates with a period determined by its mass and spring constant. The differential equation describes displacement, velocity, acceleration, and mechanical energy.";
test("WF01 rejects reserved/mock URLs, placeholders and title-only relevance", () => {
  for (const url of [
    "https://example.com/mock/a",
    "https://sub.example.org/a",
    "http://localhost/a",
    "http://127.0.0.1/a",
  ])
    assert.equal(quality.isResearchUrl(url), false);
  assert.equal(
    quality.acceptContent(topic, {
      title: topic.topic,
      original_content:
        "An investor trades stocks and currencies in financial markets. ".repeat(
          10,
        ),
    }).accepted,
    false,
  );
  assert.equal(
    quality.acceptContent(topic, { title: topic.topic, original_content: "" })
      .accepted,
    false,
  );
  assert.equal(
    quality.acceptContent(topic, {
      original_content: "Access denied. Checking your browser. ".repeat(10),
    }).accepted,
    false,
  );
  assert.equal(
    quality.acceptContent(topic, { original_content: text }).accepted,
    true,
  );
});
test("WF01 mock configuration fails closed, without generating placeholder sources", async (t) => {
  t.mock.method(global, "fetch", () => assert.fail("No network expected"));
  const previous = process.env.MOCK_LLM;
  process.env.MOCK_LLM = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.MOCK_LLM;
    else process.env.MOCK_LLM = previous;
  });
  await assert.rejects(provider.plan({ input: topic }), {
    code: "MOCK_PROVIDER_DISABLED",
  });
});
test("no-evidence report cannot be marked verified or completed", async () => {
  const result = await require("../src/jobs/verifying.job")({
    run: { id: "run" },
    input: topic,
    provider,
    report: {
      content:
        "# Dao động điều hòa\n## Tóm tắt\n## Nội dung chính\n## Kết luận\n## Giới hạn nghiên cứu\n## Tài liệu tham khảo",
      references_json: "[]",
      analysis_version_id: "a",
    },
    analysis: { id: "a", evidence_json: "[]" },
    sources: [],
    chunks: [],
    previousEvaluation: { coverage: "unavailable" },
  });
  assert.equal(result.valid, false);
  assert.equal(result.status, "partial");
  assert.ok(result.reasonCodes.includes("NO_VERIFIABLE_EVIDENCE"));
});
test("citation verification rejects invented quotes even with a matching URL and label", async () => {
  const s = {
    id: "s",
    url: "https://openstax.org/books/physics/pages/oscillations",
    provider: "tavily",
    original_content: text,
  };
  const e = {
    id: "e",
    runId: "run",
    sourceVersionId: "s",
    chunkId: "c",
    originalQuote: "This quote was invented.",
    evidenceText: "Claim",
  };
  const result = await require("../src/jobs/verifying.job")({
    run: { id: "run" },
    input: topic,
    provider,
    report: {
      content:
        "# Dao động điều hòa\n## Tóm tắt\n## Nội dung chính\nClaim [1]\n## Kết luận\n## Giới hạn nghiên cứu\n## Tài liệu tham khảo\n[1]",
      references_json: JSON.stringify([
        {
          sourceVersionId: "s",
          runId: "run",
          url: s.url,
          citationLabel: "[1]",
        },
      ]),
      analysis_version_id: "a",
    },
    analysis: { id: "a", evidence_json: JSON.stringify([e]) },
    sources: [s],
    chunks: [{ id: "c", source_version_id: "s", content: text }],
    previousEvaluation: { coverage: "sufficient" },
  });
  assert.equal(result.valid, false);
  assert.equal(result.status, "partial");
});
test("extraction batches questions once and discards only invalid provenance items", async (t) => {
  for (const key of [
    "MOCK_LLM",
    "MOCK_SEARCH",
    "GEMINI_API_KEY",
    "TAVILY_API_KEY",
  ]) {
    const old = process.env[key];
    process.env[key] = key.startsWith("MOCK") ? "false" : "offline-fixture";
    t.after(() =>
      old === undefined ? delete process.env[key] : (process.env[key] = old),
    );
  }
  t.mock.method(require("../src/config/database"), "run", async () => ({
    changes: 1,
  }));
  let calls = 0;
  t.mock.method(global, "fetch", async (url) => {
    assert.ok(url.includes("generativelanguage.googleapis.com"));
    calls++;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                evidence: [
                  {
                    questionId: "Q1",
                    chunkId: "c",
                    sourceVersionId: "s",
                    originalQuote:
                      "Simple harmonic motion occurs when the restoring force is proportional to displacement.",
                    evidenceText: "Lực phục hồi tỷ lệ với li độ.",
                    reason: "Đoạn trích trực tiếp.",
                  },
                  {
                    questionId: "Q1",
                    chunkId: "missing",
                    sourceVersionId: "fake",
                    originalQuote: "fabricated",
                    evidenceText: "fabricated",
                    reason: "fabricated",
                  },
                ],
              }),
            },
          },
        ],
      }),
    );
  });
  const result = await provider.extract(
    {
      input: topic,
      run: { id: "run" },
      signal: new AbortController().signal,
      check() {},
      sources: [
        {
          id: "s",
          provider: "tavily",
          url: "https://openstax.org/physics",
          original_content: text,
        },
      ],
    },
    [{ id: "Q1", question: "Dao động điều hòa có lực phục hồi như thế nào?" }],
    [{ id: "c", provider: "tavily", source_version_id: "s", content: text }],
  );
  assert.equal(calls, 1);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].sourceId, "s");
  assert.equal(result.evidence[0].verificationStatus, "unverified");
  assert.ok(
    result.warnings.some((w) => w.code === "INVALID_EVIDENCE_PROVENANCE"),
  );
});
test("verified citation requires an exact source quote and semantic support", async () => {
  const quote =
    "Simple harmonic motion occurs when the restoring force is proportional to displacement.";
  const source = {
    id: "s",
    provider: "tavily",
    url: "https://openstax.org/physics",
    original_content: text,
  };
  const e = {
    id: "e",
    runId: "run",
    questionId: "Q1",
    sourceVersionId: "s",
    chunkId: "c",
    originalQuote: quote,
    evidenceText: quote,
  };
  const ctx = {
    run: { id: "run" },
    input: topic,
    plan: { researchQuestions: [{ id: "Q1" }] },
    sources: [source],
    chunks: [{ id: "c", source_version_id: "s", content: text }],
    analysis: { id: "a", evidence_json: JSON.stringify([e]) },
    previousEvaluation: { coverage: "sufficient" },
    report: {
      analysis_version_id: "a",
      content: `# Dao động điều hòa\n## Summary\n## Findings\n${quote} [1]\n## Conclusion\n## Research limitations\n## References\n[1]`,
      references_json: JSON.stringify([
        {
          runId: "run",
          sourceVersionId: "s",
          url: source.url,
          citationLabel: "[1]",
          claims: [{ evidenceId: "e", text: quote }],
        },
      ]),
    },
    provider: {
      ...provider,
      json: async () => ({
        verdicts: [{ evidenceId: "e", status: "verified" }],
      }),
    },
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.status, "completed");
  assert.equal(result.verifiedCount, 1);
  ctx.provider.json = async () => ({
    verdicts: [{ evidenceId: "e", status: "unsupported" }],
  });
  const unsupported = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(unsupported.status, "partial");
  assert.equal(unsupported.citations[0].status, "unsupported");
});
test("placeholder provider keys are rejected before any paid request", async (t) => {
  const values = {
    MOCK_LLM: "false",
    MOCK_SEARCH: "false",
    GEMINI_API_KEY: "your_gemini_api_key",
    TAVILY_API_KEY: "your_tavily_api_key",
  };
  for (const [k, v] of Object.entries(values)) {
    const old = process.env[k];
    process.env[k] = v;
    t.after(() =>
      old === undefined ? delete process.env[k] : (process.env[k] = old),
    );
  }
  t.mock.method(global, "fetch", () =>
    assert.fail("Placeholder credentials must never reach a provider"),
  );
  await assert.rejects(provider.plan({ input: topic }), {
    code: "PROVIDER_CONFIGURATION",
  });
});

function reportContext(json, outputLength = "long") {
  const quote =
    "Simple harmonic motion occurs when the restoring force is proportional to displacement.";
  const s = {
    id: "s",
    provider: "tavily",
    title: "Physics",
    url: "https://openstax.org/physics",
    original_content: text,
  };
  const e = {
    id: "e",
    runId: "run",
    questionId: "Q1",
    researchQuestion: "Restoring force?",
    chunkId: "c",
    sourceVersionId: "s",
    originalQuote: quote,
    evidenceText: quote,
  };
  return {
    input: { ...topic, outputLength },
    run: { id: "run" },
    plan: { researchQuestions: [{ id: "Q1", question: "Restoring force?" }] },
    sources: [s],
    chunks: [{ id: "c", source_version_id: "s", content: text }],
    analysis: { id: "a", evidence_json: JSON.stringify([e]) },
    previousEvaluation: { coverage: "sufficient", gaps: [] },
    provider: { ...provider, json },
  };
}
test("long composing permits distinct supported paragraphs from the same evidence", async () => {
  const paragraphs = [
    "The restoring force is proportional to displacement.",
    "Displacement and restoring force vary proportionally.",
    "The passage identifies proportionality as a condition for simple harmonic motion.",
  ];
  const ctx = reportContext(async () => ({
    claims: paragraphs.map((text) => ({ evidenceId: "e", text })),
  }));
  const report = await require("../src/jobs/composing.job")(ctx);
  for (const paragraph of paragraphs)
    assert.ok(report.content.includes(paragraph));
  assert.equal(report.references[0].claims.length, 3);
  assert.match(report.content, /Outline|Dàn ý/);
});
test("verifying detects a report question omitted by composition despite sufficient evaluation", async () => {
  const ctx = reportContext(async () => ({
    verdicts: [{ evidenceId: "e", status: "verified" }],
  }));
  ctx.plan.researchQuestions.push({ id: "Q2", question: "Applications?" });
  ctx.report = {
    analysis_version_id: "a",
    content:
      "# Dao động điều hòa\n## Summary\n## Findings\nThe restoring force is proportional to displacement. [1]\n## Conclusion\n## Research limitations\n## References\n[1]",
    references_json: JSON.stringify([
      {
        runId: "run",
        sourceVersionId: "s",
        url: ctx.sources[0].url,
        citationLabel: "[1]",
        claims: [
          {
            evidenceId: "e",
            text: "The restoring force is proportional to displacement.",
          },
        ],
      },
    ]),
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.status, "partial");
  assert.ok(result.reasonCodes.includes("REPORT_QUESTION_COVERAGE_GAP"));
});
test("verifying rejects factual prose absent from registered claims", async () => {
  const ctx = reportContext(async () => ({
    verdicts: [{ evidenceId: "e", status: "verified" }],
  }));
  const claim = "The restoring force is proportional to displacement.";
  ctx.report = {
    analysis_version_id: "a",
    content: `# Dao động điều hòa\n## Summary\n## Findings\n${claim} [1]\nThis motion cures cancer. [1]\n## Conclusion\n## Research limitations\n## References\n[1]`,
    references_json: JSON.stringify([
      {
        runId: "run",
        sourceVersionId: "s",
        url: ctx.sources[0].url,
        citationLabel: "[1]",
        claims: [{ evidenceId: "e", text: claim }],
      },
    ]),
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.valid, false);
  assert.equal(result.status, "partial");
  assert.ok(result.reasonCodes.includes("UNREGISTERED_REPORT_CONTENT"));
});
test("question lexical ranking prioritizes the requested subtopic over generic topic matches", () => {
  const { rankQuestionChunks } = require("../src/services/relevance.service");
  const chunks = [
    { id: "general", content: text },
    {
      id: "energy",
      content:
        text +
        " Mechanical energy is conserved: kinetic energy and potential energy exchange.",
    },
  ];
  assert.equal(
    rankQuestionChunks(topic.topic, "mechanical energy conserved", chunks)[0]
      .id,
    "energy",
  );
});
test("length profiles bound paid calls and reserve room for verification", () => {
  const { budgetFor } = require("../src/services/research-budget.service");
  const short = budgetFor({ outputLength: "short" }),
    long = budgetFor({ outputLength: "long" });
  assert.ok(long.searchCalls > short.searchCalls);
  assert.ok(long.llmCalls > short.llmCalls);
  assert.ok(long.maxOutputTokens <= 8192);
  assert.deepEqual(long.targetWords, [2500, 4000]);
});
test("retry policy routes evidence gaps to analysis and blocks exhausted budgets", () => {
  const { retryPolicy } = require("../src/services/research-retry.service");
  const run = {
    status: "partial",
    error_code: "REPORT_QUESTION_COVERAGE_GAP",
    search_calls: 2,
    llm_calls: 6,
    input_snapshot_json: JSON.stringify({ outputLength: "medium" }),
  };
  assert.equal(retryPolicy(run).stage, "collecting");
  assert.equal(retryPolicy(run, { sourceCount: 12 }).stage, "analyzing");
  assert.equal(retryPolicy(run, { coverage: "sufficient" }).stage, "composing");
  assert.equal(
    retryPolicy({ ...run, error_code: "NO_VERIFIABLE_EVIDENCE" }).stage,
    "collecting",
  );
  assert.equal(retryPolicy({ ...run, llm_calls: 24 }).allowed, false);
  assert.equal(
    retryPolicy({ ...run, error_code: "UNREGISTERED_REPORT_CONTENT" }).stage,
    "composing",
  );
});
test("separate claim verdicts cannot verify an unsupported sibling using the same evidence", async () => {
  const ctx = reportContext(async (_ctx, _prompt, input) => ({
    verdicts: input.claims.map((c, i) => ({
      claimId: c.claimId,
      status: i === 0 ? "verified" : "unsupported",
    })),
  }));
  const claims = [
    {
      claimId: "c1",
      evidenceId: "e",
      text: "The restoring force is proportional to displacement.",
    },
    { claimId: "c2", evidenceId: "e", text: "This cures disease." },
  ];
  ctx.report = {
    analysis_version_id: "a",
    content: `# Dao động điều hòa\n## Summary\n## Findings\n${claims.map((c) => c.text + " [1]").join("\n")}\n## Conclusion\n## Research limitations\n## References\n[1]`,
    references_json: JSON.stringify([
      {
        runId: "run",
        sourceVersionId: "s",
        url: ctx.sources[0].url,
        citationLabel: "[1]",
        claims,
      },
    ]),
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.valid, false);
  assert.equal(result.status, "partial");
  assert.equal(result.citations[0].status, "unsupported");
});
test("successful citation verification preserves composition gaps", async () => {
  const ctx = reportContext(async () => ({
    verdicts: [{ evidenceId: "e", status: "verified" }],
  }));
  const claim = JSON.parse(ctx.analysis.evidence_json)[0].originalQuote;
  ctx.compositionPartial = true;
  ctx.report = {
    analysis_version_id: "a",
    content: `# Dao động điều hòa\n## Summary\n## Findings\n${claim} [1]\n## Conclusion\n## Research limitations\n## References\n[1]`,
    references_json: JSON.stringify([
      {
        runId: "run",
        sourceVersionId: "s",
        url: ctx.sources[0].url,
        citationLabel: "[1]",
        claims: [{ evidenceId: "e", text: claim }],
      },
    ]),
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.valid, true);
  assert.equal(result.status, "partial");
});
test("extraction gives all five questions their own bounded passage context", async (t) => {
  for (const key of [
    "MOCK_LLM",
    "MOCK_SEARCH",
    "GEMINI_API_KEY",
    "TAVILY_API_KEY",
  ]) {
    const old = process.env[key];
    process.env[key] = key.startsWith("MOCK") ? "false" : "offline-fixture";
    t.after(() =>
      old === undefined ? delete process.env[key] : (process.env[key] = old),
    );
  }
  t.mock.method(require("../src/config/database"), "run", async () => ({
    changes: 1,
  }));
  const observed = [];
  t.mock.method(global, "fetch", async (_url, opts) => {
    const body = JSON.parse(opts.body),
      input = JSON.parse(body.messages[1].content);
    assert.ok(body.max_tokens <= 8192);
    for (const q of input.questions) {
      assert.ok(q.chunks.length > 0 && q.chunks.length <= 7);
      observed.push(q.id);
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"evidence":[]}' } }],
      }),
    );
  });
  const questions = Array.from({ length: 5 }, (_, i) => ({
    id: `Q${i + 1}`,
    question: `Simple harmonic motion topic ${i}`,
  }));
  const chunks = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    source_version_id: "s",
    content: text + ` topic ${i}`,
  }));
  await provider.extract(
    {
      input: { ...topic, outputLength: "long" },
      run: { id: "run" },
      signal: new AbortController().signal,
      check() {},
      sources: [
        {
          id: "s",
          provider: "tavily",
          url: "https://openstax.org/physics",
          original_content: text,
        },
      ],
    },
    questions,
    chunks,
  );
  assert.deepEqual(
    observed,
    questions.map((q) => q.id),
  );
});
test("provider budget exhaustion fails before any paid transport call", async (t) => {
  const old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "offline-fixture";
  t.after(() =>
    old === undefined
      ? delete process.env.GEMINI_API_KEY
      : (process.env.GEMINI_API_KEY = old),
  );
  t.mock.method(require("../src/config/database"), "run", async () => ({
    changes: 0,
  }));
  t.mock.method(global, "fetch", () =>
    assert.fail("No request beyond atomic budget"),
  );
  await assert.rejects(
    provider.json(
      { input: { outputLength: "short" }, run: { id: "run" }, check() {} },
      "test",
      {},
    ),
    { code: "BUDGET_EXHAUSTED" },
  );
});
test("short medium and long composition request different depth without forcing filler", async () => {
  const prompts = [];
  for (const length of ["short", "medium", "long"]) {
    const ctx = reportContext(async (_ctx, prompt) => {
      prompts.push(prompt);
      return { claims: [] };
    }, length);
    const report = await require("../src/jobs/composing.job")(ctx);
    assert.equal(report.partial, true);
    assert.match(report.content, /Độ dài phụ thuộc/);
  }
  assert.ok(prompts[0].includes("400–700"));
  assert.ok(prompts[1].includes("1200–2000"));
  assert.ok(prompts[2].includes("2500–4000"));
});
test("question retrieval retains relevant continuation passages without repeating the topic name", () => {
  const { rankQuestionChunks } = require("../src/services/relevance.service");
  const result = rankQuestionChunks(
    "Dao động điều hòa",
    "Mechanical energy conservation",
    [
      {
        id: "continuation",
        content:
          "Mechanical energy is conserved when kinetic and potential energy exchange without damping.",
      },
    ],
  );
  assert.equal(result[0]?.id, "continuation");
  assert.ok(result[0].relevanceScore > 0);
});
test("factual prose hidden after References is rejected too", async () => {
  const ctx = reportContext(async () => ({
    verdicts: [{ evidenceId: "e", status: "verified" }],
  }));
  const claim = JSON.parse(ctx.analysis.evidence_json)[0].originalQuote;
  ctx.report = {
    analysis_version_id: "a",
    content: `# Dao động điều hòa\n## Summary\n## Findings\n${claim} [1]\n## Conclusion\n## Research limitations\n## References\n[1]\nInvented medical benefit. [1]`,
    references_json: JSON.stringify([
      {
        runId: "run",
        sourceVersionId: "s",
        url: ctx.sources[0].url,
        citationLabel: "[1]",
        claims: [{ evidenceId: "e", text: claim }],
      },
    ]),
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.valid, false);
  assert.ok(result.reasonCodes.includes("UNREGISTERED_REPORT_CONTENT"));
});
test("unsupported report claims retry composition rather than repeat the same verification", () => {
  const { retryPolicy } = require("../src/services/research-retry.service");
  const result = retryPolicy({
    status: "partial",
    current_stage: "verifying",
    error_code: "REPORT_CLAIM_UNSUPPORTED",
    llm_calls: 7,
    search_calls: 3,
    input_snapshot_json: "{}",
  });
  assert.equal(result.stage, "composing");
});
test("verifying does not exempt invented empirical headings", async () => {
  const ctx = reportContext(async () => ({
    verdicts: [{ evidenceId: "e", status: "verified" }],
  }));
  const claim = JSON.parse(ctx.analysis.evidence_json)[0].originalQuote;
  ctx.report = {
    analysis_version_id: "a",
    content: `# ${ctx.input.topic}\n## Summary\n## Findings\n${claim} [1]\n### This motion cures cancer\n## Conclusion\n## Research limitations\n## References\n[1]`,
    references_json: JSON.stringify([
      {
        runId: "run",
        sourceVersionId: "s",
        url: ctx.sources[0].url,
        citationLabel: "[1]",
        claims: [{ evidenceId: "e", text: claim }],
      },
    ]),
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.valid, false);
  assert.ok(result.reasonCodes.includes("UNREGISTERED_REPORT_CONTENT"));
});
test("initial collection gives each question a search before extra queries", async () => {
  let observed;
  await require("../src/jobs/collecting.job")({
    input: topic,
    plan: {
      researchQuestions: [
        { id: "Q1", question: "Force?" },
        { id: "Q2", question: "Energy?" },
      ],
      searchQueries: [
        { questionId: "Q1", query: "force one" },
        { questionId: "Q1", query: "force two" },
        { questionId: "Q2", query: "energy" },
      ],
    },
    sources: [],
    provider: {
      collect: async (_ctx, queries) => {
        observed = queries;
        return { sources: [], warnings: [] };
      },
    },
  });
  assert.deepEqual(observed.slice(0, 2), ["force one", "energy"]);
});
test("duplicate References headings cannot hide unchecked prose", async () => {
  const ctx = reportContext(async () => ({
    verdicts: [{ evidenceId: "e", status: "verified" }],
  }));
  const claim = JSON.parse(ctx.analysis.evidence_json)[0].originalQuote;
  ctx.report = {
    analysis_version_id: "a",
    content: `# ${ctx.input.topic}\n## Summary\n## Findings\n${claim} [1]\n## Conclusion\n## Research limitations\n## References\n[1]\n## References\nInvented factual statement.`,
    references_json: JSON.stringify([
      {
        runId: "run",
        sourceVersionId: "s",
        url: ctx.sources[0].url,
        citationLabel: "[1]",
        claims: [{ evidenceId: "e", text: claim }],
      },
    ]),
  };
  const result = await require("../src/jobs/verifying.job")(ctx);
  assert.equal(result.valid, false);
  assert.equal(result.status, "partial");
});
test("Vietnamese questions use their planned English query to rank English passages", async (t) => {
  for (const key of [
    "MOCK_LLM",
    "MOCK_SEARCH",
    "GEMINI_API_KEY",
    "TAVILY_API_KEY",
  ]) {
    const old = process.env[key];
    process.env[key] = key.startsWith("MOCK") ? "false" : "offline-fixture";
    t.after(() =>
      old === undefined ? delete process.env[key] : (process.env[key] = old),
    );
  }
  t.mock.method(require("../src/config/database"), "run", async () => ({
    changes: 1,
  }));
  let selected;
  t.mock.method(global, "fetch", async (_url, opts) => {
    const input = JSON.parse(JSON.parse(opts.body).messages[1].content);
    selected = input.questions[0].chunks[0].chunkId;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"evidence":[]}' } }],
      }),
    );
  });
  const question = {
    id: "Q1",
    question: "Dao động điều hòa có năng lượng cơ học như thế nào?",
  };
  await provider.extract(
    {
      input: topic,
      plan: {
        searchQueries: [
          {
            questionId: "Q1",
            query:
              "simple harmonic motion kinetic potential energy conservation",
          },
        ],
      },
      run: { id: "run" },
      signal: new AbortController().signal,
      check() {},
      sources: [
        {
          id: "s",
          provider: "tavily",
          url: "https://openstax.org/physics",
          original_content: text,
        },
      ],
    },
    [question],
    [
      { id: "general", source_version_id: "s", content: text },
      {
        id: "energy",
        source_version_id: "s",
        content:
          text +
          " Kinetic and potential energy conservation follows from the restoring force.",
      },
    ],
  );
  assert.equal(selected, "energy");
});
