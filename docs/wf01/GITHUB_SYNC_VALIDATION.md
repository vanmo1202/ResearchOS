# WF01 — GitHub sync validation

Ngày: 2026-11-27 (Asia/Ho_Chi_Minh).

## Repository và phạm vi

- Repository xác minh qua GitHub API: `vanmo1202/ResearchOS`.
- URL cũ `vanmo1202/AI-Research-Agent` trả về chính repository trên; origin đã cập nhật thành `https://github.com/vanmo1202/ResearchOS.git`.
- Source giữ nguyên: `/home/vanmo/projects/ResearchOS`, recovery HEAD `8b19132c41dc5e1e8da85b0d165711821912e9d5`.
- Tích hợp tại `/home/vanmo/projects/ResearchOS-WF01-Push`, detached HEAD có sẵn; không tạo branch/repository mới.
- Đích duy nhất được phép push: `refs/heads/cap-nhat-wf1`.
- Đích trước tích hợp và main trước push: `ca4073690d3396430c4c5f3d6693edec0482219b`.
- Commit tích hợp: `ab12f259eea2d53b8d4e10fa27fad6614958e2ef`, parent trực tiếp là ca40736, có trailer cherry-pick nguồn 8b19132.
- Worktree Release đang checkout local branch cap-nhat-wf1 và có thay đổi chưa commit từ trước. Không sửa worktree đó hoặc di chuyển local branch ref; push từ detached HEAD với refspec đích tường minh.

## Conflict và cách kết hợp

CHERRY_PICK_HEAD đúng 8b19132; index có ba stage tại research.provider.js. Tiếp tục cherry-pick đang dở, không thực hiện lần hai.

So sánh base với ours cho thấy thay đổi duy nhất trong provider của nhánh đích là bộ lọc `source-relevance.evaluateSource` trên quote, trả `OFF_TOPIC_EVIDENCE_QUOTE`. Theirs thay toàn bộ phần extract bằng lựa chọn chunks đa nguồn theo từng câu hỏi, context bounded, batching hai câu hỏi, budget theo profile và loại bằng chứng trùng.

Kết hợp thủ công: giữ triển khai WF01, chèn lại bộ lọc quote của ours sau kiểm tra quote/chunk/source provenance và trước quota/dedup. Provider kết quả khác nguồn 8b19132 đúng phần kiểm tra quote này. Không lấy nguyên ours/theirs làm kết quả cuối.

Giữ nguyên direct source fetch, URL/canonical URL checks, content acceptance, exact-substring quote, source ownership, response schema, atomic budget accounting, failed-call accounting, API timeout/auth/429 behavior và prompt injection boundaries.

## Rà soát và bảo toàn

- Đủ 22 file của commit nguồn; 21 file ngoài provider khớp byte với 8b19132. Provider chỉ bổ sung bộ lọc từ nhánh đích.
- Planning có anchored/bilingual queries; collecting phân bổ query và source slots theo câu hỏi; analyzing vẫn dùng phần giữ bằng chứng hợp lệ của nhánh đích.
- Evaluating dùng budget profile; composing có section/claim riêng, scaffold giới hạn; verifying kiểm tra từng claim và phát hiện headings/prose không đăng ký, coverage gaps và trạng thái partial.
- Worker giữ fencing/transactions, retry tạm thời có giới hạn; progress/retry API giữ tên field cũ và thêm retry policy. Frontend dùng allowed/stage/reason, fallback cho response cũ.
- DOCX/PDF export được kiểm tra bằng pipeline fixture; report history và run isolation được test trong flow-v2.
- Frontend chỉ thay RunProgress.jsx và rebuild.spec.js; không sửa navigation/Header/Dashboard/CSS/layout.
- Không sửa migrations, schema ứng dụng, database Local/production, secrets hay Docker đang phục vụ. Không SSH/deploy VPS, không merge main, không tạo PR.

Hai file test đích được cập nhật contract, giữ nguyên assertion bảo mật:

- `source-relevance.test.js`: search cap theo profile thay hardcode 3; fixture đọc chunks trong từng câu hỏi. Tiếp tục kiểm tra loại nguồn xấu, quote lạc đề và chấp nhận quote đúng.
- `flow-v2.test.js`: fixture nhận prompt section/paragraph và trả claimId; quote khác nhau có thật trong source cho từng câu hỏi để không bị dedup; kiểm tra retry_waiting, hết max_attempts thì failed, và cancellation fencing.

## Kiểm thử

Node host v24.21.0. Container test đã được stop sau regression; không stop container có sẵn. PostgreSQL test mới `researchos-wf01-sync-test-20261127`, postgres:18-alpine, loopback 127.0.0.1:32769, database `researchos_test_sync`, tmpfs riêng, không mount dữ liệu thật. Preload postgres-isolation tạo schema riêng theo test file. RESEARCH_LOAD_ENV=false, API keys giả và offline-fetch guard chặn global fetch ra ngoài loopback; provider fixtures/mock transport, không gọi Gemini/Tavily thật.

| Kiểm tra | Kết quả |
| --- | --- |
| JS syntax provider và file JS thay đổi | PASS |
| git diff --check / --cached --check | PASS |
| Focused WF01 + progress + source relevance | 39 PASS, 0 FAIL |
| Flow-v2 sau cập nhật fixture | 15 PASS, 0 FAIL |
| Regression lần đầu | 216 PASS, 6 FAIL / 222 (gồm parent failure) |
| Regression cuối sau xử lý integration fixture | 221 PASS, 1 FAIL, 0 cancelled / 222 |
| Baseline ca40736: content-security + flow-v2 cùng harness | 17 PASS, 1 FAIL / 18 |
| Frontend build | PASS |
| Baseline visual tests 375px/768px | Cùng timeout 20s như bản tích hợp |
| Frontend E2E mặc định | 37 PASS, 2 FAIL / 39; timeout 20s ở reference visuals 375px và 768px |

Lỗi còn lại: `Collector pins validated DNS and cannot follow a rebinding answer to loopback` (content-security.test.js:50), expected connected [93.184.216.34], actual []. Cùng lỗi trên baseline ca40736 trong cùng môi trường; không phải lỗi mới từ cherry-pick. Không thay đổi collector/security implementation để ép xanh. Full regression không PASS toàn bộ.

Các E2E progress/retry WF01 đều PASS. Hai visual tests timeout trong vòng lặp 12 routes; không có assertion layout thất bại được ghi nhận trước timeout. Đối chiếu baseline ca40736 với cùng dependencies/config 20s: cả 375px (20.2s) và 768px (20.3s) cũng timeout. Hai lỗi được tái hiện trên nhánh đích trước tích hợp; không tuyên bố E2E toàn bộ PASS.

Lần E2E đầu gặp dependency symlink nằm ngoài Vite serving allowlist; lượt đó không dùng làm kết luận. Đã sao chép dependencies vào worktree, giữ executable symlinks nội bộ, chạy lại với config mặc định. Không đổi config hoặc timeout để ép PASS.

Log kiểm thử đầy đủ ngoài repo: `/tmp/researchos-wf01-sync-validation/`. Báo cáo recovery cũ có 182 PASS/39 FAIL/1 cancelled và E2E 38/1; baseline đích hiện có các test fixes mới hơn, nên dùng kết quả chạy mới và đối chiếu ca40736 ở trên.

## Kiểm tra an toàn và GitHub

Trước push: tập thay đổi không có .env, secrets, keys/certificates, database dump, backup archives. Quét mẫu private keys/GitHub/Gemini/Tavily/OpenAI tokens không có match; các assignment trong tests chỉ là fixture hoặc placeholder. deploy/compose.local-recovery.yml chỉ tham chiếu image Local, không chứa secret.

Lịch sử chuẩn bị push chỉ gồm commit tích hợp và báo cáo validation, không kéo 32 commit recovery. origin/cap-nhat-wf1 phải là tổ tiên của HEAD; remote và main được đối chiếu lại ngay trước/sau push. Không force push.

Trạng thái push: chưa thực hiện; kết quả xác minh sau push sẽ bổ sung dưới đây.

## GO / NO-GO

- GO đồng bộ nhánh cap-nhat-wf1 để review/kiểm thử tiếp: focused WF01, source relevance và flow-v2 đều đạt; không coi đây là release gate toàn hệ thống.
- NO-GO VPS: regression còn lỗi baseline; kiểm thử mock không xác minh chất lượng/chi phí provider thật. Cần disposition lỗi security test, kiểm thử provider thật có kiểm soát và gate triển khai riêng.
