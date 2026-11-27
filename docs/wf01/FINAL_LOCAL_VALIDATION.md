# WF01 — final local validation

Ngày 21/11/2026. Nhánh hiện tại: `recovery/postgresql-frontend-20261113`.

## Trạng thái thay đổi

- Working tree giữ nguyên các thay đổi WF01 chưa commit; không SSH, không sửa VPS/production data, không push/merge/deploy.
- So với `origin/main`: ahead 3, behind 0. Không reset, rebase hoặc cherry-pick.
- Không thay schema, auth/ownership, Docker Compose hoặc workflow JSON.
- Các sửa chính: retrieval/ranking theo từng research question; extraction exact quote/provenance; ngân sách Tavily/Gemini theo `short|medium|long`; composing Markdown nhiều paragraph có outline/analysis/examples/conclusion/references; verifying toàn bộ claim, heading và phần sau References; partial/retry minh bạch; export DOCX/PDF không cắt nhầm heading.

## Kiểm thử hiện tại

- Focused WF01 + worker six-stage + progress + DOCX/PDF: **PASS 35/35** (`/tmp/wf01-focused-current.log`). Chạy với PostgreSQL container test riêng, mock provider, container đã dọn.
- Frontend build: **PASS** (`/tmp/wf01-build-current.log`).
- Full backend log đã lưu từ phiên trước: **183 pass, 38 fail, 1 cancelled** trên 222 test. Baseline HEAD cũ: **162 pass, 39 fail, 1 cancelled** trên 202 test. Không có failure name mới so với baseline; các failure còn lại thuộc Auth/Chat/knowledge/legacy Flow V2 và môi trường fixture, không sửa lan sang ngoài phạm vi WF01.
- Frontend mock E2E lần đầy đủ gần nhất: **38 pass, 1 fail** ở `reference visuals fit 1440px` do timeout thiếu `#main-content` sau navigation. Chạy riêng lại bài này 2/2 pass; PDF upload cũng pass khi chạy riêng. Hai regression UI WF01 mới đều pass. Vì lỗi full E2E không tái hiện ổn định, không coi full E2E là PASS.
- Binary export: focused pipeline đã kiểm tra DOCX ZIP/XML và PDF text extraction; artifact phiên trước ở `/tmp/wf01-quality-report.docx`, `/tmp/wf01-quality-report.pdf`, `/tmp/wf01-quality-report.md`.
- `git diff --check`: PASS.

## Nguyên nhân còn lại

Baseline backend còn đỏ ở các nhóm: auth/session, auto-chat/Gemini transport, PDF/chat concurrency, knowledge ownership, legacy workflow fixtures và một số test kỳ vọng mock provider cũ. So sánh failure names cho thấy không có lỗi mới do patch WF01. E2E 1440px là lỗi timing/navigation không ổn định; chạy lặp riêng pass, nên cần điều tra riêng nếu muốn gate frontend tuyệt đối.

## GO / NO-GO

**GO cho review local WF01**: 35 regression/focused tests pass, build pass, provenance/claim/partial/retry/export đã có coverage và code review không còn finding.

**NO-GO cho merge/deploy/production**: full backend vẫn có 38 failure + 1 cancelled; full E2E chưa ổn định; chưa gọi Tavily/Gemini live và chưa chứng minh long report 2500–4000 từ với dữ liệu thật. Không thực hiện merge/deploy.

## Chạy lại tối thiểu

```bash
docker run -d --name researchos-wf01-check --memory=512m \
  -e POSTGRES_USER=researchos -e POSTGRES_PASSWORD=wf01-local-only \
  -e POSTGRES_DB=researchos_test_wf01 -p 127.0.0.1:55432:5432 postgres:18-alpine
export PGHOST=127.0.0.1 PGPORT=55432 PGUSER=researchos
export PGPASSWORD=wf01-local-only PGDATABASE=researchos_test_wf01
node --import ./backend/test/helpers/postgres-isolation.mjs --test \
  backend/test/wf01-quality.test.js backend/test/wf01-pipeline.test.js \
  backend/test/researchos-progress-snapshot.test.js \
  backend/test/report-docx-format.test.js backend/test/report-export.test.js
npm --prefix frontend run build
npm --prefix frontend run test:rebuild
docker rm -f researchos-wf01-check
```

Full audit and historical baseline remain in [LOCAL_VALIDATION.md](./LOCAL_VALIDATION.md). Patch snapshot: `/tmp/researchos-wf01-local.patch`.
