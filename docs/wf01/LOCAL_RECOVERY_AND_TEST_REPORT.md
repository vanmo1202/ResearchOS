# ResearchOS Local — Recovery and Test Report

- Thời điểm xác minh: 2026-11-26 15:41 +07 (Asia/Ho_Chi_Minh).
- Repository: `/home/vanmo/projects/ResearchOS`.
- Nhánh giữ nguyên: `recovery/postgresql-frontend-20261113`.
- **Local: đã khôi phục PostgreSQL, backend và worker; readiness trực tiếp/proxy HTTP 200.**
- **VPS: NO-GO** vì regression chưa xanh và E2E mặc định còn timeout. Không truy cập VPS.

## Nguyên nhân và cách khôi phục

PostgreSQL và worker còn bind mount secret từ repository cũ
`/home/vanmo/projects/ResearchOS-Recovery-20261113/deploy/secrets/postgres_password`.
Docker báo OCI mount failure do đường dẫn không tồn tại. PostgreSQL dừng khiến backend
restart với thông báo startup/database error và proxy không có backend sẵn sàng.

Đã kiểm tra Compose project `ai-research-agent`, cluster PostgreSQL 18, `PG_VERSION`,
`global/pg_control` và volume `ai-research-agent_postgres_data` trước khi khởi động.
`up --no-deps` ban đầu vẫn dùng container cũ do config hash không thay đổi;
sau đó force-recreate riêng PostgreSQL bằng Compose tại repository hiện tại để cập nhật mount.
Không tạo đường dẫn giả hoặc sửa nội dung secret.

- Giữ nguyên volume tại `/var/lib/postgresql`, cluster `/var/lib/postgresql/18/docker`.
- Secret dùng: `/home/vanmo/projects/ResearchOS/deploy/secrets/postgres_password`.
- `pg_isready`: accepting connections.
- `psql -h 127.0.0.1` bên trong PostgreSQL với mật khẩu đọc từ secret: thành công,
  database/user đều `researchos`; không chỉ kiểm tra Unix socket.
- 35 bảng public; dump đọc được toàn bộ database. Restore sang database test thành công:
  35 bảng, 39 source_versions, 6 research_runs. Không restore vào database thật.
- Sau khôi phục vẫn có 6 research_runs, 39 source_versions, 52 stage_jobs;
  cả 52 jobs đều succeeded. Không có job chờ trước khi khởi động worker.
- Backend cũ tự phục hồi sau PostgreSQL; worker được tạo lại để sửa mount cũ.
- Sau kiểm thử, build source mới thành image riêng
  `researchos-local-recovery:20261126-wf01`; thay riêng backend/worker của project chính.
- Thêm `deploy/compose.local-recovery.yml` để chọn image Local riêng, không đổi tag dùng chung.
  12/12 file backend source đã thay đổi/thêm mới khớp byte với backend đang chạy.

## Backup và bảo toàn code

Backup riêng tư, ngoài repository: `/home/vanmo/ResearchOS-backups/20261126-153223` (thư mục mode 0700).

| Artifact | Nội dung / xác minh |
| --- | --- |
| `working.patch` | Git diff binary so với HEAD, giữ nguyên 13 file đã sửa |
| `untracked.tar.gz` | 4 file mới và toàn bộ docs/wf01 có sẵn trước khi làm |
| `config.tar.gz` | Compose, root .env, deploy/secrets; không đưa nội dung vào báo cáo |
| `researchos.dump` | pg_dump custom, 1.615.402 bytes; file mode 0600 |
| `pg_restore-list.txt` | pg_restore --list exit 0, 358 dòng |
| `restore-check.log` | Restore thật trong PostgreSQL test, --exit-on-error, exit 0 |
| `SHA256SUMS` | Checksums của patch, archive và dump |
| `artifacts/` | DOCX, PDF và Markdown từ focused pipeline test |
| `final-verification.json` | Readiness, image/container IDs, mount và so sánh source |

Đã đối chiếu lại: Git diff trước/sau giống hệt và từng file untracked gốc không thay đổi.
Chỉ thêm override Local và báo cáo này. Không reset/clean/rebase/chuyển nhánh/commit/push/merge.
Không sửa thuật toán, test, layout/Header/Dashboard hoặc secrets. Không xóa volume hay prune.

## Kiểm thử WF01 và backend

PostgreSQL test riêng: `researchos-local-recovery-test-20261126`, postgres:18-alpine,
loopback port 32768, dữ liệu tmpfs, không mount volume thật. Database:
`researchos_test_recovery`, `researchos_test_baseline`, `researchos_test_backup`.
Các test file dùng schema riêng qua `test/helpers/postgres-isolation.mjs`.
Test container đã được stop sau khi kiểm thử; dữ liệu test tmpfs không được giữ lại.
Các container test có sẵn từ trước không bị stop hoặc xóa.

Dùng custom provider/transport fixtures và mock flags, `RESEARCH_LOAD_ENV=false`,
API keys giả; không dùng keys thật. Lần regression đối chiếu cuối còn preload
`offline-fetch.cjs` để từ chối global fetch ra ngoài loopback. Không đánh giá chất lượng
Gemini/Tavily thật hoặc chi phí thực tế qua các fixture này.

| Kiểm thử | Kết quả |
| --- | --- |
| Focused: wf01-pipeline, wf01-quality, researchos-progress-snapshot | 28 PASS, 0 FAIL trên Node 24 host |
| Cùng focused suite trong image ứng viên Node 22 | 28 PASS, 0 FAIL |
| Backend regression lần đầu | 181 PASS, 40 FAIL, 1 cancelled / 222 |
| Backend regression cuối với offline fetch guard | 182 PASS, 39 FAIL, 1 cancelled / 222 |
| HEAD baseline đầy đủ, cùng guard và dependency versions | 159 PASS, 42 FAIL, 1 cancelled / 202 |

Baseline lấy bằng `git archive HEAD` đầy đủ repository ở ngoài working tree;
không checkout hoặc đổi nhánh. So sánh tên test lỗi: không xuất hiện tên failure mới
trên source hiện tại; 38 tên failure chung (số tổng còn gồm parent/subtest failures).
Hai tên chỉ fail ở lần baseline: transient retry/cancellation và global response-body limiter;
không coi đây là bằng chứng chúng đã được sửa vì có yếu tố timing.
Chi tiết: `regression-comparison.json`, `backend-offline-regression.log`,
`baseline-complete-regression.log`. Không dùng lượt baseline thiếu fixtures để kết luận.

Các lỗi regression còn lại tập trung ở auth/chat, document-chat, knowledge,
flow-v2, content-security, source-relevance và orchestration integration.
Ví dụ: tạo Chat thiếu research trả 409; fixture legacy kỳ vọng partial/completed nhưng
provider fail-closed trả failed/MOCK_PROVIDER_DISABLED; assertion collector/provenance
và một test bị cancelled. Không sửa fixture hoặc thuật toán để ép PASS.

Focused suite đã kiểm tra:

- Planning → Collecting → Analyzing → Evaluating → Composing → Verifying chạy đủ sáu job.
- Coverage từng câu hỏi; context bounded và truy xuất câu hỏi Việt/nguồn Anh.
- Profile short/medium/long khác nhau về search/LLM calls, tokens và độ sâu.
- Quote/chunk/source provenance, loại nguồn giả, không hợp thức hóa quote bịa.
- Báo cáo nhiều đoạn có citation; xác minh từng claim, phát hiện prose không đăng ký.
- Retry theo nguyên nhân, giữ budget, chặn budget hết; partial thực thi đủ báo 100%.
- DOCX giải nén đọc document.xml; PDF parse lại text thật, không chỉ kiểm tra đuôi file.

## Frontend build và E2E

- `npm run build`: PASS; chỉ tạo dist Local, không thay frontend đang phục vụ 8080.
- `npm run test:rebuild`: 38 PASS, 1 FAIL / 39 (rebuild.spec.js + reference.spec.js).
- Lỗi: `reference visuals fit 375px`, timeout tổng 20.000 ms trong vòng lặp 12 routes.
  Chạy lại riêng theo cấu hình mặc định vẫn timeout; điểm dừng thay đổi giữa
  kiểm tra main-content và scrollWidth.
- HEAD baseline với dependencies nằm trong serving root: cùng test PASS ở 19,4 giây.
- Source hiện tại chạy chẩn đoán bằng `--timeout 60000`: PASS ở 20,3 giây;
  không sửa file test hoặc cấu hình mặc định. Kết quả phù hợp với ca chạy sát ngưỡng,
  chưa đủ để khẳng định regression giao diện hay tuyên bố E2E mặc định toàn bộ PASS.
- E2E dùng API fixtures; không thay thế kiểm thử trình duyệt có provider thật.
- Frontend 8080 giữ nguyên container ID và image ID trước/sau; không build/recreate frontend.

## Trạng thái container sau công việc

- `ai-research-agent-worker-1`: Up About a minute (healthy). Ports: `3000/tcp`
- `ai-research-agent-backend-1`: Up About a minute (healthy). Ports: `127.0.0.1:3000->3000/tcp`
- `researchos-local-recovery-test-20261126`: Exited (0) Less than a second ago
- `ai-research-agent-postgres-1`: Up 6 minutes (healthy). Ports: `5432/tcp`
- `researchos-ci-test`: Exited (0) 12 days ago
- `researchos-postgres-gui`: Up 16 hours. Ports: `127.0.0.1:15432->15432/tcp`
- `ai-research-agent-frontend-1`: Up 16 hours (healthy). Ports: `127.0.0.1:8080->80/tcp`
- `researchos-recovery-test-20261113`: Exited (0) 12 days ago
- `ai-research-agent-n8n-1`: Up 16 hours (healthy). Ports: `127.0.0.1:5679->5678/tcp`
- `researchos-workflow-tests-20261109`: Exited (0) 2 weeks ago
- `researchos-v3-db-1`: Exited (127) 2 weeks ago
- `ai-research-flow-v2-check-worker-1`: Up 16 hours (healthy). Ports: `3000/tcp`
- `ai-research-flow-v2-check-backend-1`: Up 16 hours (healthy). Ports: `127.0.0.1:13000->3000/tcp`
- `ai-research-flow-v2-check-frontend-1`: Up 16 hours (healthy). Ports: `127.0.0.1:18080->80/tcp`
- `ai-research-flow-v2-check-n8n-1`: Up 16 hours (healthy). Ports: `127.0.0.1:15678->5678/tcp`
- `ai-research-n8n`: Up 16 hours. Ports: `0.0.0.0:5678->5678/tcp, [::]:5678->5678/tcp`
- `intelligent_banzai`: Exited (0) 7 weeks ago

## Cổng Docker cần kiểm tra

| Cổng host | Container phục vụ |
| --- | --- |
| 3000 (127.0.0.1) | ai-research-agent-backend-1 |
| 8080 (127.0.0.1) | ai-research-agent-frontend-1, giữ nguyên |
| 13000 (127.0.0.1) | ai-research-flow-v2-check-backend-1, không thay đổi |
| 18080 (127.0.0.1) | ai-research-flow-v2-check-frontend-1, không thay đổi |
| 5678 (mọi interface, như trước) | ai-research-n8n, không thay đổi |
| 5679 (127.0.0.1) | ai-research-agent-n8n-1, không thay đổi |
| 15678 (127.0.0.1) | ai-research-flow-v2-check-n8n-1, không thay đổi |

Cổng 15432 của researchos-postgres-gui cũng giữ nguyên. PostgreSQL chính không publish
5432 ra host. Port test 32768 không còn phục vụ sau khi stop container test.
Không dừng/recreate bất kỳ n8n nào, không can thiệp workflow đang chạy.

## Vận hành Local và quyết định triển khai

Lệnh dùng để chọn đúng image WF01 Local (chạy từ repository root):

```bash
docker compose -p ai-research-agent -f docker-compose.yml \
  -f deploy/compose.local-recovery.yml up -d --no-deps --no-build --pull never backend worker
```

Image phải được build từ `./backend` với tag đã ghi trong override.
Không chạy lệnh trên cho project khác. Chạy Compose gốc mà bỏ override có thể chọn lại
image backend tag cũ, nên giữ override khi vận hành bản Local này.

Xác minh cuối: postgres/backend/worker/frontend/n8n chính đều Healthy;
`http://127.0.0.1:3000/health/ready` và
`http://127.0.0.1:8080/health/ready` đều HTTP 200, database postgresql.

**NO-GO triển khai VPS.** Local đã phục hồi và source WF01 mới đã chạy, nhưng regression
còn fail/cancelled và E2E cấu hình mặc định còn timeout. Cần xử lý hoặc thống nhất disposition
cho các lỗi baseline, ổn định kiểm tra 375px và chạy lại các gate trước khi triển khai.
Không có SSH, push, merge hoặc thay đổi VPS trong phiên này.
