# Rich content and math implementation plan

**Goal:** Unify academic Markdown and safe math in chat, saved reports, WF01 previews and exports.
**Architecture:** Shared React renderer uses GFM, remark-math and untrusted KaTeX. A code-aware delimiter scanner is shared with export parsing. Export renders individual formulas as high resolution images, keeping document text selectable and existing APIs intact.
**Spec:** User attachment “RESEARCHOS — NÂNG CẤP AI CHAT, REPORT FORMATTING VÀ LATEX MATH”.
**Constraints:** Work on automation-ci-cd; no branch/worktree/database/Docker/deploy changes. No real providers in tests. Preserve citations, TOC, states, generation and API contracts.

- [x] Add failing delimiter and component/browser tests for math, code, currency, Unicode, unsafe URLs and malformed input.
- [x] Implement shared delimiter scanner and memoized RichContentRenderer; scoped responsive typography; integrate ChatMessage and ReportMarkdown.
- [x] Add failing export tests, render isolated formulas to high resolution PNG, integrate DOCX and PDF including tables. Document image/OMML limitation.
- [x] Run targeted tests, format check, build and frontend E2E at 375/768/1440; run export regressions without database access.
- [x] Review diff/security, write docs/frontend/RICH_CONTENT_MATH_REPORT.md, commit scoped files and push automation-ci-cd when validation succeeds.

**Review focus:** Escaped delimiters, nested Markdown code, numeric currency, hostile TeX commands, and long content must remain safe and contained. Tests must cover each.

**Validation:** 14 targeted tests and 66 mocked frontend E2E tests passed; frontend format/build passed. Independent review findings were reproduced and fixed. PostgreSQL-backed suites were excluded under the user’s explicit no-database-changes constraint. Implementation commit: `fd32134f39a18f993b6199202841a57f40285daa`, pushed to `origin/automation-ci-cd`.
