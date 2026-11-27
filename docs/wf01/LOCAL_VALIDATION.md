# WF01 — sửa chất lượng và kiểm thử Ubuntu Local

Ngày: 20/11/2026. Nhánh: `recovery/postgresql-frontend-20261113`.

Chỉ sửa working tree trên nhánh hiện tại. Không SSH/VPS, push/merge, deploy, sửa `.env`, production data, auth/ownership, schema/migration, năm workflow JSON hoặc Docker Compose. Chạy test bằng PostgreSQL18 container mới `researchos-wf01-quality-local`, DB `researchos_test_wf01`, schema riêng cho từng file test. Container test đã được dọn sau kiểm thử. Container giới hạn512MB, chỉ publish loopback; không dùng DB/container ứng dụng.

## Audit và quyết định

- `research.provider.js`: trước đây chỉ3 search,12 LLM; retrieval gộp/cắt12 chunk, dễ bỏ câu hỏi cuối. Nay ngân sách theo độ dài, search ưu tiên câu hỏi, chia context theo từng câu hỏi, đa dạng nguồn và score từ vựng riêng cho câu hỏi. Passage tiếp nối không cần nhắc lại tên chủ đề khi nguồn đã qua topical gate và có ít nhất2 từ khóa câu hỏi. Query tiếng Anh đã lập cho đúng questionId được dùng cùng câu hỏi tiếng Việt khi xếp hạng passage tiếng Anh; có regression riêng để passage về năng lượng không thua đoạn giới thiệu chung. Extraction batch2 câu hỏi, quote nguyên văn tối đa400 ký tự, ID question/chunk/source và hash/provenance giữ nguyên. Không dùng snippet thay cho truy cập trực tiếp; không tạo URL/quote giả.
- `planning.job.js` giữ nguyên adapter; prompt planner ở provider yêu cầu query cho từng câu hỏi. `collecting.job.js` ưu tiên một query/câu hỏi trước query phụ, ưu tiên gap ở vòng bổ sung/retry. `analyzing.job.js` giữ nguyên merge bằng chứng truy xuất được qua các vòng. `evaluating.job.js` dùng giới hạn chung; tối đa2 vòng bổ sung, giữ ngân sách dành cho composing/verifying.
- `composing.job.js`: bỏ giới hạn một concise claim/evidence. Viết từng phần theo câu hỏi, có dàn ý, giải thích chuyên sâu, phân tích, ví dụ/phương pháp nếu nguồn hỗ trợ, kết luận, giới hạn và references. Mỗi paragraph thực chứng đăng ký riêng với `claimId` và `evidenceId`; nhiều đoạn có thể dùng cùng evidence. Chỉ chuyển exact quote cho bước viết, không đưa suy diễn của extraction làm sự thật. Có thông báo giới hạn độ dài khi nguồn mỏng, không lấp đủ số từ bằng nội dung giả.
- `verifying.job.js`: kiểm tra exact provenance, source/run/analysis, toàn bộ paragraph và heading, cả phần sau References. Chỉ heading scaffold/chủ đề/câu hỏi đã sanitize được phép; không bỏ qua heading tùy ý. Chỉ một heading References đúng cấp và nguyên dòng. Không để title câu hỏi bắt đầu “References…” cắt nội dung. Semantic verdict riêng từng claim, batch10; một evidence verified không xác minh thay claim khác. Verdict thiếu/trùng/unsupported hoặc provider lỗi không thể hoàn tất. Citation validity tách khỏi trạng thái run: composing có gap hoặc evaluation chưa sufficient vẫn partial.
- `runner.js`: giữ lease, heartbeat, fencing, transaction và persisted orchestration. Chuyển cờ partial từ composing sang verifying; lỗi provider tạm thời được retry có backoff và budget cũ; lỗi auth/config/schema/budget không auto-retry. Event/error an toàn nêu rõ retry đã được lên lịch.
- `run.service.js`: terminal partial đã thực thi đủ6 giai đoạn trả100% **thực thi**, vẫn status partial. API progress thêm trường tương thích `retry:{allowed,stage,reason}`. Thiếu nguồn: collect nếu còn budget/source slots; thiếu extraction: analyze; analysis đủ nhưng báo cáo thiếu câu hỏi: compose; claim unsupported: compose; lỗi semantic tạm thời: verify. Không reset budget; manual retry có event và giữ idempotency.
- `RunProgress.jsx`: partial hiện “Đã dừng — hoàn thành một phần”, retry nêu giai đoạn và bị disable khi hết budget. `RunWorkspacePage.jsx` giữ nguyên polling terminal, khóa thao tác và retry idempotency. `RunResults.jsx` giữ nguyên cảnh báo quality và chỉ hiện xác minh khi server valid; không biến số nguồn/thanh progress thành xác minh.
- `source-relevance.service.js` giữ gate, aliases, URL/provenance. `relevance.service.js` thêm ranking câu hỏi bên cạnh API ranking cũ. `report.service.js` là luồng legacy, không tham gia composing WF01 nên giữ nguyên. `run-export.service.js` chỉ sửa regex tách References, tránh cắt mất nội dung DOCX/PDF khi heading câu hỏi chứa từ đó.

## Ngân sách cứng mỗi run

| Độ dài | Tavily | Gemini | Max output tokens/request | Chunk/câu hỏi | Evidence/câu hỏi | Paragraph/câu hỏi | Mục tiêu từ |
|---|---:|---:|---:|---:|---:|---:|---|
| short |5|16|2048|3|3|4|400–700|
| medium |6|24|4096|5|6|8|1200–2000|
| long |8|36|8192|7|10|12|2500–4000|

Đây là trần, không phải quota phải tiêu hết. Planner tối đa2048 output tokens. Search basic, max5 candidates/query; source text tối đa16000 ký tự, chunk đã lưu khoảng1000 ký tự; provider calls tuần tự, không fan-out mới. Mọi request đã gửi (kể cả thất bại/retry) tiêu budget bằng atomic DB counter. Không thêm dependency hay tăng pool/concurrency; chưa benchmark/soak trên VPS4GB.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Regression WF01 + worker6 giai đoạn + progress + DOCX/PDF | PASS35/35 |
| Toàn bộ backend `npm test` | FAIL:222 tests,183 pass,38 fail,1 cancelled |
| Backend HEAD chưa sửa trong `/tmp/researchos-wf01-baseline` |202 tests,162 pass,39 fail,1 cancelled |
| So sánh failure names | Không có failure mới; cả38 failure đều có trong HEAD gốc |
| Frontend build | PASS |
| Frontend mock E2E cuối | FAIL:38 pass,1 fail (`reference visuals fit 1440px`, thiếu `#main-content` sau navigation) |
| `git diff --check` | PASS |
| Review | Đã sửa tất cả finding; reviewer xác nhận không còn finding |

Có một lần mock E2E 38 pass/1 fail: `PDF upload keeps pending status and parsing errors remain visible` timeout20s chờ input Tải PDF. Chạy riêng lại cùng2 regression UI:3/3 PASS. Lần đầy đủ đầu trước khi thêm test retry stage:38/38 PASS. Lần đầy đủ cuối lại fail bài responsive1440px (screenshot trắng),38 pass/1 fail; hai regression UI mới đều pass. Chạy riêng bài responsive1440px hai lần đều PASS (2/2); vẫn chưa kết luận nguyên nhân của lỗi navigation không ổn định này. Ghi lại lần fail, không coi retry riêng là bằng chứng full suite pass.

Binary export: kiểm tra DOCX ZIP/Word XML giữ toàn bộ claim và heading; PDF thật có font Unicode và trích xuất được text. Pipeline xuất chính report vừa tạo bằng `run-export.service`, không thay bằng chuỗi giả. Artifact fixture local: `/tmp/wf01-quality-report.{md,docx,pdf}`. Đây là fixture ngắn để kiểm tra cấu trúc/provenance/renderer, không phải báo cáo nghiên cứu live2500 từ.

Không chạy provider live Tavily/Gemini trả phí, không chứng minh chất lượng nguồn live/độ dài2500–4000 từ thực tế hoặc factual correctness ngoài exact quote+semantic checker. Không chạy VPS/production E2E, n8n Cloud hoặc load/soak4GB. Backend suite còn đỏ nên không thể gọi toàn hệ thống PASS. Các lỗi Auth/Chat/fixture cũ nằm ngoài thay đổi này, không nới gate mock để làm xanh test.

### Các test backend chưa qua

Một cancelled nằm trong `Knowledge workspace: durable PDF, scoped grounded chat and verified memory`; timeout ở `PDF prompt injection stays untrusted data and chat concurrency is bounded`. Danh sách leaf failures từ lần chạy cuối:

- Auth sessions, CSRF, ownership, legacy preservation, revocation and throttling
- Real transport shape: short Vietnamese query, English source, minimal citation and subject-free verbatim quote complete end to end
- Gemini failures preserve safe structured diagnosis in stored messages and never retry
- Tavily failure, empty search, off-topic results and unreadable sources are different outcomes
- Routing authentication failure stops before paid search; no misleading searched flag
- HTTP failure exposes safe code without leaking provider auth as user session expiration; history and ownership remain intact
- Budget reservation failure is distinct and stops before synthesis HTTP
- Search succeeded but blocked/unreadable web pages do not become provider authentication failure
- Auto defaults to Internet without creating Research Plan; rejects finance/private URLs, persists web citations and memory safely
- Reads actual page when raw_content is absent; snippets and title cannot launder off-topic content
- All irrelevant, duplicate/low-quality sources and provider failures do not fabricate evidence or retry charged searches
- One Gemini routing call and synthesis use real transport shape, anchored queries, follow-up history and conflicting citations
- Several domains use the same retrieval/filtering pipeline, without domain-specific routing branches
- Atomic turn/user/global budgets survive new sessions and do not refund after an uncertain call
- Auto uses private PDFs offline; when local synthesis is insufficient it performs one controlled Internet fallback without exposing private text in queries
- Fresh questions bypass web cache and cross-account snapshot resolution is forbidden
- Two charged queries remain bounded and a public-to-private redirect yields no facts or synthesis call
- Direct PDF chat requires no research/planner, uses correct pages, verifies memory and isolates owners
- Unrelated question never calls Gemini; Vietnamese/English terms reach FTS and invalid claims cannot become memory
- HTTP document-only endpoints keep Auth/CSRF and cross-account document/chat/memory access denied
- Chat history cursor returns earlier messages in order and cannot cross chat ownership
- mock produces partial rather than fabricated evidence
- full success, exports and historical report preserved
- search-more limited to two rounds
- invalid citation yields partial
- n8n stages wait for authenticated dispatch rather than auto-executing
- provider query isolation, timeouts, translation failure and durable budgets
- later analysis outage retains validated evidence and report history
- grounded response stores only validated citations and extractive memory candidates
- hallucinated chunk/source/page/quote rejected and provider prompt treats PDF injection as data
- PDF prompt injection stays untrusted data and chat concurrency is bounded
- research-only source/evidence retrieval and changed-source invalidation
- WF03 provider timeout leaves one failed turn; same-token retry cannot duplicate it or leak secrets
- WF01 uses backend-authoritative orchestration and progresses both modes through all stages
- Flow v2 rejects all off-topic Tavily results, persists zero sources and terminates partial after bounded retry
- Flow v2 mixed collection normalizes snippets, deduplicates, excludes misleading bodies and does not spend LLM budget
- V2 extraction excludes bad sources before Gemini and rejects off-topic quotes inside a valid chunk

Log local: `/tmp/wf01-backend-final.log`, `/tmp/wf01-backend-baseline.log`, `/tmp/wf01-focused-final.log`, `/tmp/wf01-frontend-build-final.log`, `/tmp/wf01-frontend-e2e-final.log`, `/tmp/wf01-e2e-retry.log`, `/tmp/wf01-reference-retry.log`. Log RED được giữ ở `/tmp/wf01-*-red.log`.

## Chạy lại local

Từ root repo, tạo **container test mới**, chọn port trống; không dùng DB ứng dụng:

```bash
docker run -d --name researchos-wf01-quality-check --memory=512m \
  -e POSTGRES_USER=researchos -e POSTGRES_PASSWORD=wf01-local-test-only \
  -e POSTGRES_DB=researchos_test_wf01 -p 127.0.0.1:55432:5432 postgres:18-alpine
docker exec researchos-wf01-quality-check pg_isready -U researchos
export PGHOST=127.0.0.1 PGPORT=55432 PGUSER=researchos
export PGPASSWORD=wf01-local-test-only PGDATABASE=researchos_test_wf01
unset PGSCHEMA
node --import ./backend/test/helpers/postgres-isolation.mjs --test \
  backend/test/wf01-quality.test.js backend/test/wf01-pipeline.test.js \
  backend/test/researchos-progress-snapshot.test.js \
  backend/test/report-docx-format.test.js backend/test/report-export.test.js
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run test:rebuild
# Sau khi xong, chỉ xóa container test vừa tạo:
docker rm -f researchos-wf01-quality-check
```

Cần Node22–24, dependencies đã cài và Chrome; có thể đặt `PLAYWRIGHT_CHROME_PATH` nếu dùng Chromium. Mock E2E dùng Vite4175 và API routes trong test, không cần backend ứng dụng. Full backend suite hiện vẫn có lỗi baseline như bảng trên.

Kiểm thử thủ công có provider local đã cấu hình: tạo **run mới** cho “Dao động điều hòa”, goal ứng dụng/phương pháp giải/các dạng bài, lần lượt short/medium/long; kiểm tra mỗi câu hỏi có passage/evidence đúng, quote khớp nguồn, paragraph có trích dẫn và verdict, ví dụ chỉ từ nguồn. Nếu thiếu evidence, partial phải dừng rõ và retry phải nêu giai đoạn; kiểm tra counters không reset. Export DOCX/PDF từ public UI và đối chiếu nội dung/Unicode/references. Không chạy bước này trên dữ liệu production.

## File thay đổi và diff

Diff review local: `git diff --stat`, `git diff`; patch đầy đủ gồm file mới: `/tmp/researchos-wf01-local.patch`.

- `backend/src/jobs/collecting.job.js`
- `backend/src/jobs/composing.job.js`
- `backend/src/jobs/evaluating.job.js`
- `backend/src/jobs/verifying.job.js`
- `backend/src/providers/research.provider.js`
- `backend/src/services/relevance.service.js`
- `backend/src/services/report-scaffold.service.js`
- `backend/src/services/research-budget.service.js`
- `backend/src/services/research-retry.service.js`
- `backend/src/services/run-export.service.js`
- `backend/src/services/run.service.js`
- `backend/src/workers/runner.js`
- `backend/test/researchos-progress-snapshot.test.js`
- `backend/test/wf01-pipeline.test.js`
- `backend/test/wf01-quality.test.js`
- `docs/wf01/LOCAL_VALIDATION.md`
- `docs/wf01/local-quality-plan.md`
- `frontend/src/components/research/RunProgress.jsx`
- `frontend/tests/rebuild.spec.js`
