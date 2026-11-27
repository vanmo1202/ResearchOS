import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMath } from '../src/utils/normalizeMath.js';

test('normalizes AI delimiters and single-line display math', () => {
  assert.equal(normalizeMath(String.raw`Năng lượng \(E=mc^2\).`), 'Năng lượng $E=mc^2$.');
  assert.equal(normalizeMath(String.raw`\[\frac{a}{b}\]`), '$$\n\\frac{a}{b}\n$$');
  assert.equal(normalizeMath('$$x^2$$'), '$$\nx^2\n$$');
});
test('preserves code, escapes, currency and table structure', () => {
  for (const source of [
    '```tex\n$5 \\(x\\)\n```',
    '~~~\n$$a$$\n~~~',
    '`$x$ \\(a\\)`',
    '    $code$ \\(x\\)',
    String.raw`\\(escaped\\) and \$5`,
  ])
    assert.equal(normalizeMath(source), source);
  assert.equal(normalizeMath('Giá $5 và $10, $20.50 USD'), 'Giá \\$5 và \\$10, \\$20.50 USD');
  assert.equal(normalizeMath('| $x$ | \\(y\\) |'), '| $x$ | $y$ |');
});
test('does not merge unmatched delimiters across paragraphs', () => {
  assert.equal(normalizeMath('$x\n\nnext $y$'), '\\$x\n\nnext $y$');
});
test('keeps numeric math and protects linked URLs and nested fenced examples', () => {
  assert.equal(normalizeMath('$2 + 2=4$'), '$2 + 2=4$');
  assert.equal(
    normalizeMath(String.raw`$\href{https://evil.example}{x}$`),
    String.raw`$\href{https://evil.example}{x}$`,
  );
  for (const source of [
    '> ```tex\n> \\(x\\) $code$\n> ```',
    '- ```tex\n  $code$\n  ```',
    '[Nguồn](https://example.org/$path$)',
  ])
    assert.equal(normalizeMath(source), source);
});
test('multiline math in blockquotes does not duplicate quote markers', () => {
  assert.equal(normalizeMath('> \\[\n> \\frac{a}{b}\n> \\]'), '> $$\n> \\frac{a}{b}\n> $$');
  assert.equal(normalizeMath('> $$\n> x^2\n> $$'), '> $$\n> x^2\n> $$');
});
