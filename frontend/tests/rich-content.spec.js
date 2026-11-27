import { test, expect } from '@playwright/test';
const markdown = String.raw`# Nghiên cứu tiếng Việt

## Phương pháp

Đoạn **in đậm** và *in nghiêng*, ~~gạch bỏ~~. [Nguồn 1](https://example.org/source).
Dòng tiếp theo.

### Kết quả

#### H4
##### H5
###### H6

1. Danh sách
   - Mục con $x_i^2$

> Bằng chứng cần đối chiếu.

Inline $E=mc^2$, \(\sqrt{x^2+y^2}\), $\alpha+\beta$, $P(A\mid B)=\frac{P(A\cap B)}{P(B)}$.

$$\frac{-b\pm\sqrt{b^2-4ac}}{2a}$$

\[\begin{bmatrix}1&2\\3&4\end{bmatrix}\]

$$
\begin{aligned}a&=b+c\\d&=e+f\end{aligned}
$$

$$\sum_{i=1}^{n}i+\int_a^b f(x)\,dx+\lim_{x\to0}x+\vec{v}$$

$$\begin{cases}x+y=1\\x-y=0\end{cases}$$

| Tiêu chí | Giá trị |
| --- | --- |
| Công thức | $\frac{a}{b}$ |
| Dài | ${'w'.repeat(300)} |

Giá $5 và $10.50 USD. Escape \$20.

${'`'}$not_math$ \(code\)${'`'}

${'`'.repeat(3)}tex
  $$not_math$$
  \(not_math\)
${'`'.repeat(3)}

Lỗi riêng $\frac{1}{$ vẫn tiếp tục.

<script>window.pwned = true</script>

[nguy hiểm](javascript:alert(1))

$\href{https://evil.example}{evil}$
$\htmlClass{evil}{x}$

## Kết luận

${'Đoạn văn tiếng Việt đầy đủ khoảng cách.\n\n'.repeat(40)}

$$${'x+'.repeat(200)}y$$
`;
async function render(page, kind, content = markdown) {
  await page.route('**/api/**', (route) => route.fulfill({ json: { success: true, data: null } }));
  await page.goto('/');
  await page.evaluate(
    async ({ markdown, kind }) => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js');
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { default: Report } = await import('/src/components/research/ReportMarkdown.jsx');
      const { default: Chat } = await import('/src/components/knowledge/ChatMessage.jsx');
      document.getElementById('root').style.display = 'none';
      const host = document.createElement('main');
      host.id = 'fixture';
      host.style.cssText = 'width:100%;padding:16px;box-sizing:border-box;min-width:0';
      document.body.append(host);
      ReactDOM.createRoot(host).render(
        kind === 'report'
          ? React.createElement(
              'article',
              { className: 'report-document' },
              React.createElement(Report, null, markdown),
            )
          : React.createElement(Chat, {
              message: {
                role: 'assistant',
                status: 'complete',
                content: markdown,
                citations: [
                  {
                    referenceId: 'r1',
                    title: 'Nguồn đối chiếu',
                    url: 'https://example.org/source',
                    sourceId: 's1',
                  },
                ],
              },
            }),
      );
    },
    { markdown: content, kind },
  );
}
for (const width of [375, 768, 1440]) {
  for (const kind of ['report', 'chat']) {
    test(`${kind} rich content, safe math and containment at ${width}px`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 900 });
      await render(page, kind);
      const host = page.locator('#fixture');
      await expect(host.locator('.katex').first()).toBeVisible();
      expect(await host.locator('.katex').count()).toBeGreaterThanOrEqual(12);
      await expect(host.locator('.katex-display').first()).toBeVisible();
      await expect(host.locator('.katex-error')).toHaveCount(1);
      await expect(host.locator('li li')).toContainText('Mục con');
      await expect(host.locator('strong').filter({ hasText: 'in đậm' })).toHaveCSS(
        'display',
        'inline',
      );
      await expect(host.locator('pre code')).toHaveText('  $$not_math$$\n  \\(not_math\\)\n');
      await expect(host).toContainText('Giá $5 và $10.50 USD. Escape $20.');
      await expect(
        host.locator('a[href^="javascript:"],a[href*="evil.example"],script,.evil'),
      ).toHaveCount(0);
      expect(await page.evaluate(() => window.pwned)).toBeUndefined();
      await expect(host.getByRole('link', { name: 'Nguồn 1', exact: true })).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const table = host.locator('.rich-table-scroll');
      await expect(table).toHaveAttribute('tabindex', '0');
      expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      expect(
        await host
          .locator('.katex-display')
          .last()
          .evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(true);
      await host.getByRole('button', { name: 'Sao chép LaTeX' }).first().click();
      await expect(host.getByRole('textbox', { name: 'Mã nguồn LaTeX' }).first()).toHaveValue(
        /E=mc/,
      );
      if (kind === 'report') {
        await host.locator('summary').click();
        const tocLink = host.locator('.studio-report-toc a').filter({ hasText: 'Kết luận' });
        const href = await tocLink.getAttribute('href');
        await tocLink.click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
      } else await expect(host.locator('.citation-card')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }
}

async function integrationFixture(page) {
  const writes = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() !== 'GET') writes.push(path);
    const report = {
      id: 'report-one',
      title: 'Nghiên cứu tiếng Việt',
      content: markdown,
      references: [
        { citationLabel: '[Nguồn 1]', title: 'Nguồn đối chiếu', url: 'https://example.org/source' },
      ],
      created_at: '2026-11-28',
      citationValidation: { valid: true },
    };
    const chat = {
      id: 'chat-one',
      request_id: 'research-one',
      document_ids_json: '[]',
      internet_enabled: 0,
      auto_research: 0,
      title: 'Lịch sử công thức',
    };
    let data = [];
    if (path === '/api/auth/me') data = { id: 'test-user', name: 'Người kiểm thử' };
    else if (path === '/api/research/research-one')
      data = {
        request: { id: 'research-one', topic: 'Nghiên cứu tiếng Việt', status: 'completed' },
      };
    else if (path === '/api/research/research-one/report') data = report;
    else if (path.endsWith('/evidence'))
      data = { evidence: [{ id: 'e1' }], gaps: [], coverage_status: 'full' };
    else if (path.endsWith('/reports')) data = [report];
    else if (path.endsWith('/progress'))
      data = { status: 'completed', completedStages: [], recentEvents: [], percent: 100 };
    else if (path === '/api/chats/chat-one') data = chat;
    else if (path.endsWith('/chats')) data = [chat];
    else if (path.endsWith('/messages'))
      data = [
        {
          id: 'm1',
          position: 1,
          role: 'assistant',
          status: 'complete',
          content: markdown,
          citations: [
            { referenceId: 'r1', title: 'Nguồn đối chiếu', url: 'https://example.org/source' },
          ],
        },
      ];
    await route.fulfill({ json: { success: true, data } });
  });
  return writes;
}
for (const width of [375, 768, 1440]) {
  for (const path of [
    '/workflow-4/research-one',
    '/research/research-one/runs/run-one?tab=report',
    '/research/research-one/chat/chat-one',
    '/chat/chat-one',
  ]) {
    test(`integrated ${path} preserves math and layout at ${width}px`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const writes = await integrationFixture(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.locator('.rich-content .katex').first()).toBeVisible();
      await expect(page.locator('.rich-table-scroll')).toBeVisible();
      expect(
        await page.locator('.rich-table-scroll').evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (path.includes('chat')) {
        await expect(page.locator('.chat-message .citation-card a')).toHaveAttribute(
          'href',
          'https://example.org/source',
        );
        await page.reload();
        await expect(page.locator('.chat-message .katex').first()).toBeVisible();
      } else {
        await expect(page.locator('.studio-report-toc')).toBeVisible();
        await expect(page.locator('.report-references a, .os-gaps a').first()).toHaveAttribute(
          'href',
          'https://example.org/source',
        );
      }
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('stateful TeX definitions cannot affect later formulas', async ({ page }) => {
  await render(
    page,
    'report',
    String.raw`$\gdef\polluted{42}$

$\polluted$

Nội dung vẫn đọc được.`,
  );
  await expect(page.locator('#fixture')).toContainText('Công thức không được hỗ trợ');
  await expect(page.locator('#fixture .katex-html')).toContainText('\\polluted');
  await expect(page.locator('#fixture .katex-html')).not.toContainText('42');
});
