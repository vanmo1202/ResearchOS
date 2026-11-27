const { renderPdf: pdf } = require('./report-pdf.service');
const { parseMathMarkdown } = require('./report-math.service');
const { renderDocx: docx } = require('./report-docx.service');
const reportService = require('./report.service');
const requests = require('../models/request.model');
const sources = require('../models/source.model');
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf' };
const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
function markdownText(content) {
    // Legacy mock reports stored escaped newlines; normalize only this known envelope for presentation.
    return !content.includes('\n') && content.includes('\\n##') ? content.replace(/\\n/g, '\n') : content;
}
function inline(tokens = [], style = {}) {
    return tokens.flatMap(token => {
        if (token.type === 'strong') return inline(token.tokens, { ...style, bold: true });
        if (token.type === 'em') return inline(token.tokens, { ...style, italics: true });
        if (token.type === 'link') return inline(token.tokens, { ...style, url: safeUrl(token.href) });
        if (token.type === 'br') return [{ text: '\n', ...style }];
        if (token.type === 'image') return [{ text: token.text || '', ...style }];
        return token.tokens ? inline(token.tokens, style) : [{ text: token.text || token.raw || '', ...style }];
    });
}
function blocks(tokens, options = {}) {
    return tokens.flatMap(token => {
        if (['space', 'def'].includes(token.type)) return [];
        if (token.type === 'heading') return [{ ...options, level: token.depth, runs: inline(token.tokens) }];
        if (token.type === 'list') return token.items.flatMap((item, index) => {
            const parts = blocks(item.tokens, { ...options, indent: (options.indent || 0) + 1 });
            if (parts[0]) parts[0].prefix = token.ordered ? `${Number(token.start || 1) + index}. ` : '• ';
            return parts;
        });
        if (token.type === 'blockquote') return blocks(token.tokens, { ...options, quote: true });
        if (token.type === 'table') {
            const readCell = cell => inline(cell.tokens?.length ? cell.tokens : [{ type: 'text', text: cell.text || '' }]);
            const header = token.header.map(readCell);
            const rows = token.rows.map(row => row.map(readCell));
            // Keep legacy PDF's text representation; DOCX consumes the structured table.
            return [
                { ...options, table: { header, rows }, runs: [{ text: token.header.map(cell => cell.text).join(' | '), bold: true }] },
                ...token.rows.map(row => ({ ...options, tableContinuation: true, runs: [{ text: row.map(cell => cell.text).join(' | ') }] })),
            ];
        }
        if (token.type === 'hr') return [{ runs: [{ text: '────────' }] }];
        if (token.type === 'code') return [{ ...options, code: true, runs: [{ text: token.text }] }];
        return [{ ...options, runs: token.tokens ? inline(token.tokens) : [{ text: token.text || token.raw || '' }] }];
    });
}
async function loadExport(requestId) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) throw Object.assign(new Error('Mã nghiên cứu không hợp lệ.'), { status: 400 });
    const request = await requests.findById(requestId);
    if (!request) throw Object.assign(new Error('Không tìm thấy nghiên cứu.'), { status: 404 });
    const report = await reportService.getReport(requestId);
    if (!report) throw Object.assign(new Error('Không tìm thấy báo cáo đã lưu.'), { status: 404 });
    const originalSources = await sources.getSourcesByRequestId(requestId);
    const references = report.references.filter(ref => safeUrl(ref.url)).map(ref => {
        const source = originalSources.find(item => item.url === ref.url);
        const title = source ? source.titleVi || source.displayTitle || (source.sourceLanguage === 'vi' ? source.title : null) || 'Nguồn tài liệu' : ref.title || 'Nguồn tài liệu';
        return { ...ref, title }; // Preserve the saved citation label and original URL.
    });
    const { lexer } = await import('marked');
    const tokens = lexer(markdownText(report.content));
    let referenceDepth = null;
    const body = tokens.filter((token, index) => {
        if (index === 0 && token.type === 'heading' && token.text === report.title) return false;
        if (token.type === 'heading' && /^(?:\d+[.)]?\s*)?(?:tài liệu tham khảo|references)\s*$/i.test(token.text)) { referenceDepth = token.depth; return false; }
        if (referenceDepth && token.type === 'heading' && token.depth <= referenceDepth) referenceDepth = null;
        return !referenceDepth;
    });
    const created = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(report.createdAt.replace(' ', 'T') + (/[zZ]|[+]\d{2}:\d{2}$/.test(report.createdAt) ? '' : 'Z')));
    return { report, request, references, body: await parseMathMarkdown(body.map(token => token.raw).join('')), created,
        filename: `Bao_cao_nghien_cuu_${requestId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 8)}` };
}
async function exportReport(id, format) {
    const data = await loadExport(id);
    return { buffer: await (format === 'docx' ? docx(data) : pdf(data)), filename: `${data.filename}.${format}`, mime: MIME[format] };
}
module.exports = { exportReport, markdownText, renderDocx: docx, renderPdf: pdf, blocks };
