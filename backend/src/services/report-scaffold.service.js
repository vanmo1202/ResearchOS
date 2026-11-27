// Only these non-empirical notices may appear outside verified claim paragraphs.
function notices(en) {
  return en
    ? {
        missing: "No suitable evidence available.",
        partial: "Evidence is insufficient for a complete conclusion.",
        covered: "All questions have traceable evidence.",
        limit:
          "Web sources may change; independent peer review has not been performed.",
        length:
          "Length is constrained by available evidence; unsupported detail has been omitted.",
      }
    : {
        missing: "Chưa có bằng chứng phù hợp.",
        partial: "Chưa đủ bằng chứng để kết luận đầy đủ.",
        covered: "Các câu hỏi đều có bằng chứng truy xuất được.",
        limit: "Nguồn web có thể thay đổi; chưa có đánh giá phản biện độc lập.",
        length:
          "Độ dài phụ thuộc bằng chứng hiện có; chi tiết chưa có căn cứ đã được lược bỏ.",
      };
}
module.exports = { notices };

function headingText(value) {
  return String(value || "")
    .replace(/[\r\n#<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function allowedHeadings(input, plan) {
  return new Set([
    `# ${headingText(input.topic)}`,
    ...[
      "Summary",
      "Tóm tắt",
      "Outline",
      "Dàn ý",
      "Findings",
      "Nội dung chính",
      "Conclusion",
      "Kết luận",
      "Research limitations",
      "Giới hạn nghiên cứu",
      "References",
      "Tài liệu tham khảo",
    ].map((t) => `## ${t}`),
    ...[
      "Explanation",
      "Giải thích chuyên sâu",
      "Analysis",
      "Phân tích",
      "Examples and methods",
      "Ví dụ và phương pháp",
    ].map((t) => `#### ${t}`),
    ...(plan?.researchQuestions || [])
      .filter((q) => q.question)
      .map((q) => `### ${headingText(q.question)}`),
  ]);
}
module.exports.headingText = headingText;
module.exports.allowedHeadings = allowedHeadings;
