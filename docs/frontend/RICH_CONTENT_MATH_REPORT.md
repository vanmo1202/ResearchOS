# ResearchOS — Rich content và công thức toán học

Ngày: 28/11/2026. Nhánh: `automation-ci-cd`.

## Nguyên nhân

- Chat và report dùng hai cấu hình ReactMarkdown riêng, chỉ có GFM; chưa có remark-math/KaTeX nên LaTeX hiện thành ký tự.
- `.chat-message strong` đặt `display: block`, font nhỏ và margin cho cả bold trong câu, khiến đoạn văn bị tách sai.
- Renderer chưa có typography và vùng cuộn thống nhất. CSS cũ đặt bảng thành block tự cuộn, xung đột với wrapper mới.
- Khung chat flex kế thừa `align-items: start` từ layout grid cũ; nội dung toán dài làm cả panel nở theo kích thước nội tại.
- Export DOCX/PDF đọc Markdown bằng marked, không nhận biết toán. PDF cũ xuất bảng thành văn bản phân cách bằng dấu `|`.

## Thay đổi

### Frontend

- `frontend/src/components/ui/RichContentRenderer.jsx`: renderer memoized dùng react-markdown, remark-gfm, remark-math, rehype-katex; soft line breaks; link qua safeExternalUrl; bảng có region cuộn và focus bàn phím.
- `frontend/src/components/ui/rich-content.css`: H1–H6, paragraph, nested lists, blockquote, code, bảng, math; khắc phục CSS bold; công thức inline/display dài cuộn riêng.
- `frontend/src/utils/normalizeMath.js`: nhận biết code fences, inline code, indented code, HTML, Markdown links/definitions qua AST trước khi chuẩn hóa delimiter. Giữ escape, tiền tệ và cấu trúc bảng; sửa prefix blockquote nhiều dòng.
- `frontend/src/components/knowledge/ChatMessage.jsx`: dùng renderer chung cho message hiện tại/lịch sử và trạng thái complete/failed; giữ pending/retry/error và CitationCard.
- `frontend/src/components/research/ReportMarkdown.jsx`: dùng renderer chung, giữ TOC và ID heading riêng cho từng instance.
- `frontend/src/main.jsx`: import KaTeX CSS đúng một lần.
- `frontend/src/styles/unified-chat.css`: sửa flex alignment và chuyển vùng cuộn bảng sang wrapper.
- `frontend/package.json`, `frontend/package-lock.json`: thêm các dependency Markdown/math cần thiết; không thay phiên bản dependency có sẵn.

### Backend

- `backend/src/services/report-math.service.js`: parse GFM/math thành block/run dùng chung cho hai export; MathJax chỉ dùng base/AMS, render SVG cục bộ rồi sharp chuyển từng công thức sang PNG độ phân giải cao (~288 DPI tại kích thước hiển thị).
- `backend/src/utils/normalizeMath.mjs`: cùng thuật toán chuẩn hóa với frontend. Hai bản được giữ đồng nhất vì frontend/backend có Docker build context riêng; không tạo dependency runtime xuyên thư mục.
- `backend/src/services/report-docx.service.js`: chèn ImageRun với alt text chứa mã TeX; giới hạn kích thước theo trang/ô bảng; căn giữa display math; giữ bảng Word thật, font, margins, TOC và references.
- `backend/src/services/report-pdf.service.js`: layout text + formula images, Unicode fonts, bảng có border, wrap và phân trang; header quá cao không lặp để tránh cắt công thức; body formula được giới hạn theo vùng in còn lại.
- `backend/src/services/report-export.service.js`: giữ cách lấy dữ liệu/loại references cũ và URL/filename/API, thay phần render toán và PDF.
- `backend/src/services/run-export.service.js`: áp dụng cùng parser cho báo cáo WF01 đã lưu.
- `backend/package.json`, `backend/package-lock.json`: thêm parser/math/image dependencies; không đổi phiên bản dependency có sẵn.

## An toàn và hành vi

Không dùng dangerouslySetInnerHTML hoặc rehype-raw. Bỏ HTML sinh bởi AI, không tải ảnh Markdown từ xa, không cho javascript/data URLs hoặc credentials trong link. KaTeX dùng trust=false, strict=error, maxExpand=500 và maxSize=20 ([tài liệu options chính thức](https://katex.org/docs/options.html)); chặn định nghĩa macro có trạng thái. Export không gọi provider, không chạy TeX shell, không tải URL hay tài nguyên ngoài; chỉ tải base/AMS và chặn lệnh URL/HTML/định nghĩa macro. LaTeX sai chỉ fallback ở công thức đó.

Nút “Sao chép LaTeX” lấy source từ MathML annotations và công thức lỗi; hiển thị textarea để chọn/copy thủ công nếu clipboard không khả dụng. Nội dung và cấu trúc message/report lưu trong database không bị chỉnh sửa.

Tiền tệ như `$5 và $10.50` giữ nguyên. Dollar amount thuần số được xem là văn bản; dùng `\(42\)` nếu muốn ép một số thuần thành toán học. Các delimiter `\(...\)`, `\[...\]`, `$...$`, `$$...$$` được hỗ trợ trong văn bản; ví dụ code được giữ nguyên.

## Kiểm thử

- `frontend/tests/math-normalization.test.mjs`: AI delimiters, display một dòng, code fences backtick/tilde, indented/inline code, escaped delimiters, tiền tệ, numeric math, table, URL, code trong list/blockquote, unmatched delimiter và math blockquote nhiều dòng.
- `frontend/tests/rich-content.spec.js`: component thật trong trình duyệt và trang tích hợp thật, API hoàn toàn giả lập; 375/768/1440px; H1–H6, Unicode, inline/display, fraction, root, exponent/subscript, sigma/integral/limit/vector/Greek, matrix/cases/aligned/probability, malformed TeX, math trong list/bảng, code có `$`, XSS/URL/TeX không tin cậy, macro isolation, source copy, nội dung dài, TOC/citations và history reload.
- `frontend/playwright.rich-content.config.js`: chạy rich-content cùng rebuild/reference/unified-chat, không khởi động backend/database.
- `backend/test/report-math-export.test.js`: tạo DOCX/PDF thật, kiểm tra PNG/OOXML/bảng Word, trích text Unicode bằng PDF.js, ảnh toán, reference links, giới hạn chiều rộng ô Word và tọa độ ảnh trong bảng PDF cao; kiểm tra cả hai entrypoint export bằng stub read-only của data access.
- `backend/test/report-docx-format.test.js`: regression định dạng DOCX có sẵn.

Hai finding Important từ review độc lập (blockquote prefix và PDF bảng cao) đều có test tái hiện thất bại trước sửa, sau đó pass. Không còn finding chưa xử lý từ review.

### Kết quả cuối

| Kiểm tra | Lệnh / phạm vi | Kết quả |
| --- | --- | --- |
| Targeted | `node --test frontend/tests/math-normalization.test.mjs backend/test/report-math-export.test.js backend/test/report-docx-format.test.js` | 14/14 pass (5 normalize, 6 math/export, 3 DOCX regression) |
| Frontend format | `cd frontend && npm run format:check` | Pass |
| Frontend build | `cd frontend && npm run build` | Pass; renderer là chunk riêng (~438 kB, gzip ~132 kB) |
| Frontend E2E | `cd frontend && npm test -- --config playwright.rich-content.config.js --workers=2` | 66/66 pass; 3.3 phút |
| Dependencies | `npm ls --depth=0` trong frontend/backend | Pass |
| Diff và secrets | `git diff --check`; quét additions và file mới cho mẫu private key/API token | Pass, không phát hiện mẫu secrets |

E2E gồm 19 bài mới và 47 regression có sẵn, toàn bộ API giả lập. Lần chạy trước có một assertion mới giả định lệnh TeX không hỗ trợ luôn tạo class `.katex-error`; KaTeX thực tế render lệnh chưa biết thành chữ đỏ. Assertion đã được sửa để kiểm tra trực tiếp source fallback và không mở rộng macro. Test malformed fraction vẫn kiểm tra `.katex-error`. Lần chạy toàn bộ cuối cùng không có lỗi.

Không chạy default E2E/backend full suite dùng PostgreSQL: bootstrap tạo schema/database, trái ràng buộc không thay đổi PostgreSQL. Các kiểm thử export chạy trực tiếp không preload postgres-isolation; không ghi database và không gọi Gemini/Tavily thật.

## Trạng thái chat, report và export

- Research Chat và Document Chat hiện đi qua DocumentChatPage/ChatPanel/ChatMessage; ResearchChatPage cũ cũng dùng ChatPanel nên nhận renderer chung. Lịch sử legacy vẫn dùng ChatMessage.
- ReportPage, báo cáo lưu và RunResults/WF01 preview dùng ReportMarkdown; giữ TOC, CitationCard, references, verification/generation/budget và API contracts.
- Đã tạo file thật `/tmp/researchos-rich-content/sample.docx` và `sample.pdf`. PDF đã được rasterize và xem trực quan: tiếng Việt, phân số, matrix, aligned, inline math và bảng hiển thị đúng. DOCX đã kiểm tra cấu trúc OOXML, ảnh PNG, kích thước và hyperlinks.
- DOCX chưa có OMML: công thức là ảnh có alt text TeX, không chỉnh sửa như Word Equation. Thư viện có primitive math nhưng chưa có bộ chuyển đầy đủ LaTeX sang OMML, đặc biệt matrix/aligned; tránh triển khai converter thiếu chức năng trong thay đổi này.
- PDF giữ text Unicode có thể chọn; toán là ảnh riêng, không phải screenshot toàn trang. Công thức quá dài được thu nhỏ để vừa vùng in, có thể cần chia phương trình để đọc tốt trên giấy.
- Không kiểm tra DOCX bằng ứng dụng Microsoft Word/LibreOffice vì môi trường không có ứng dụng đó; đã kiểm tra file DOCX thật ở mức OOXML/media. Không tuyên bố visual roundtrip Word.
- KaTeX và MathJax base/AMS không hỗ trợ mọi extension TeX; công thức không hỗ trợ trong export hiện thông báo an toàn, không xuất TeX thô như công thức đã trình bày. Source TeX vẫn có trong dữ liệu gốc, và alt text của công thức render thành công.

## Git

- Commit triển khai đã kiểm thử: `fd32134f39a18f993b6199202841a57f40285daa`.
- Đã push thành công commit triển khai lên `origin/automation-ci-cd` tại `https://github.com/vanmo1202/ResearchOS`.
- Báo cáo này và implementation plan được commit riêng ngay sau commit triển khai, trên cùng nhánh.
- Không đổi nhánh, tạo worktree, merge main, thay đổi PostgreSQL/secrets, rebuild Docker hay deploy VPS. Cây làm việc ban đầu sạch; không có thay đổi CI/CD tồn đọng cần di chuyển.
