# Final test validation — WF01

Ngày: 2026-11-27, Asia/Ho_Chi_Minh.

- Repository: vanmo1202/ResearchOS; worktree /home/vanmo/projects/ResearchOS-WF01-Push, giữ detached HEAD.
- Trước sửa: HEAD và origin/cap-nhat-wf1 cùng `410da6c90485d1e89927f36f8192d604d49a556e`, chứa `ab12f259eea2d53b8d4e10fa27fad6614958e2ef`.
- main trước công việc: `ca4073690d3396430c4c5f3d6693edec0482219b`.
- Không sửa source recovery, workflow/provider WF01, Auth/Knowledge/Chat, frontend layout/CSS, schema/migrations, Docker Compose hoặc VPS.

## DNS rebinding

Collector dùng dns.promises.lookup(all:true), kiểm tra toàn bộ IP, rồi truyền lookup trả các địa chỉ đã kiểm tra vào Undici Agent. Test mock đúng resolver này và có socket sentinel loopback để phát hiện một lần lookup thứ hai không an toàn.

Nguyên nhân thực tế: offline-fetch preload từ chối hostname audit-rebind.invalid ngay tại global fetch, trước khi Undici dispatcher/net.connect chạy. Ghi nhận hostname bị chặn trong blocked-hosts.log, cùng lỗi expected [93.184.216.34], actual []. Không phải DNS trả danh sách rỗng hoặc collector mất pinning.

Sửa duy nhất trong backend/test/content-security.test.js: test DNS dùng undici.fetch qua t.mock.method(global,fetch). Socket mock vẫn chặn mọi kết nối public trước khi gửi packet, chỉ cho phép loopback sentinel nếu xảy ra rebinding. Các test khác vẫn dùng offline guard. Không đổi production collector, IP blocklist, redirect checks hoặc assertions.

- Trước sửa, harness có guard: 2 PASS, 1 FAIL / 3.
- Sau sửa lần 1: 3 PASS, 0 FAIL, 0 cancelled.
- Sau sửa lần 2: 3 PASS, 0 FAIL, 0 cancelled.
- Sau sửa lần 3: 3 PASS, 0 FAIL, 0 cancelled.
- Kiểm tra độ nhạy: preload ngoài repo thay lookup đã pin bằng dns.lookup trong bộ nhớ, không sửa file production. Test FAIL vì privateHits=1 (expected 0), chứng minh assertion chống rebinding vẫn phát hiện lỗ hổng. Không gửi request ra public IP.

## Responsive E2E

Đo từng route bằng performance.now: navigation, main-content assertion, scrollWidth assertion, screenshot; fixture đăng ký một lần mỗi test, không login/setup lặp và không có explicit sleep/retry dư thừa.

| Width | 12 navigation | main-content | scrollWidth | screenshots |
| --- | --- | --- | --- | --- |
| 375px | 10834ms | 7027ms | 563ms | 634ms |
| 768px | 11326ms | 6654ms | 599ms | 871ms |

Tổng thao tác gần 20s trước overhead setup/browser. Không có bằng chứng lỗi layout thật; không sửa frontend source/CSS.

Thử tối ưu page.goto với waitUntil=domcontentloaded để tránh chờ load event cho các tài nguyên không cần trước assertion. Giữ nguyên mọi route, main-content/scrollWidth/pageerror assertions và screenshots. Thử nghiệm vẫn sát ngưỡng: 375px PASS 19.8s, 768px FAIL timeout 20.2s; dừng các lượt thử còn lại vì tối ưu này không tạo dư địa ổn định.

Quyết định cuối: giữ page.goto đầy đủ ban đầu; chỉ đặt timeout 30s trong ba test responsive 12 routes (~19s thao tác trước setup, cần dư địa cho render/browser load). Cấu hình chung vẫn 20s, số E2E vẫn 39, không bỏ route/assertion, không skip/fixme và không đổi production frontend. Đây là budget cho khối lượng test đo được, không phải che một assertion layout thất bại.

Kết quả targeted với timeout riêng 30s, không CLI override timeout:

| Lần | 375px | 768px |
| --- | --- | --- |
| 1 | PASS 21.6s | PASS 20.8s |
| 2 | PASS 18.9s | PASS 20.4s |
| 3 | PASS 19.1s | PASS 19.6s |

1440px kiểm tra riêng: PASS 20.7s. Mọi route vẫn chạy main-content/scrollWidth assertions; không horizontal overflow hoặc pageerror. Bộ targeted đạt xong mới chạy full suites.

## Môi trường test

PostgreSQL test mới researchos-final-tests-20261127, postgres:18-alpine, database researchos_test_final, loopback port Docker cấp ngẫu nhiên, tmpfs riêng và không mount volume dữ liệu thật. Preload postgres-isolation tạo schema riêng từng test file. RESEARCH_LOAD_ENV=false, keys giả, offline-fetch guard; không đọc .env hoặc API keys thật.

Log chi tiết: /tmp/researchos-final-tests/. Không chạy full regression cho đến khi hai nhóm targeted ổn định.

## Kết quả cuối / Git / GO

- Backend full regression duy nhất sau targeted: **222 PASS, 0 FAIL, 0 cancelled, 0 skipped** / 222 (27.2s).
- Frontend build: **PASS** (1.34s).
- Frontend full E2E với npm run test:rebuild, không grep/repeat/timeout override: **39 PASS, 0 FAIL, 0 skipped** (3.3 phút); responsive 375px 19.5s, 768px 20.5s, 1440px PASS.
- Container PostgreSQL test riêng đã stop sau regression; không thay container Local có sẵn.
- Commit sửa tối thiểu: `834b7a873b36b33fd1c490dcb6d258935b8d1998`, đã push vào origin/cap-nhat-wf1 bằng refspec HEAD:refs/heads/cap-nhat-wf1, không force.
- Fetch xác minh SHA GitHub khớp HEAD sau push bản sửa; main giữ nguyên ca4073690d3396430c4c5f3d6693edec0482219b.
- Báo cáo được commit/push tiếp dưới dạng docs-only; SHA tip chứa báo cáo xem git log. Không push recovery/main, không PR hoặc VPS.
- Kiểm tra syntax và git diff --check: PASS. Chỉ hai file test thay đổi (7 dòng thêm) cùng báo cáo này; không có .env, secrets, backups hoặc credentials thật.

**GO kiểm thử provider thật có kiểm soát** trên môi trường test riêng và budget giới hạn. Chưa chạy Gemini/Tavily thật, nên chưa xác minh chất lượng báo cáo, chi phí, latency hoặc rate limits thực tế. GO này không phải quyền triển khai VPS.

Rủi ro còn lại: visual tests duyệt nhiều route phụ thuộc tải máy; timeout riêng 30s có dư địa so với các lượt đo 18.9–21.6s, không phải bảo đảm tuyệt đối trên mọi host. DNS test cố ý đi qua transport thật nhưng chặn socket public bằng mock và đã mutation-check chống mất pinning. Không có lỗi test còn tồn tại trong lượt kiểm thử cuối.
