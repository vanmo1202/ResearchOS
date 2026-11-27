# WF01 local quality repair

Scope: current branch, Ubuntu local only. No SSH, deployment, push/merge, schema or workflow JSON changes.

Root causes: global chunk truncation starves later questions; three searches can be spent on early sources; one concise claim/evidence prevents depth; verifier ignores unregistered prose and conflates multiple claims per evidence; partial stage completion capped at 99%; retry repeats final verification for evidence gaps.

Implementation sequence:
1. Add failing regression tests for question-balanced retrieval, multi-paragraph composition, omitted-question coverage, unregistered prose, multiple claims per evidence, preserved partial state and retry policy.
2. Shared bounded length profiles (search/call/output-token/context/claim budgets). Question-first lexical retrieval with source diversity; exact quotes, question-to-chunk validation. Keep direct source fetch and provenance.
3. Compose one bounded section per question, with evidence-linked explanation, analysis and examples; outline, conclusion, limitations and references. Long target 2500–4000 words conditional on evidence; no padding.
4. Verify all prose against registered claims, semantic checks per claim in bounded batches; never promote insufficient/conflicting evidence or persisted partial report.
5. Stage completion and terminal partial display; retry policy routes evidence gaps to extraction/retrieval if budget remains, blocks exhausted budget, retains existing counters.
6. Run full backend tests in isolated local test DB, frontend build and mock E2E, PDF/DOCX checks. Document exact results and local reproduction commands.

Resource bounds: sequential provider calls, bounded source text and context; no new dependencies or parallel worker fan-out. Existing ownership/auth/contracts remain authoritative.
