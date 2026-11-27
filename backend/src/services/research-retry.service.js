const { budgetFor } = require("./research-budget.service");
function retryPolicy(run, { sourceCount = 0, coverage } = {}) {
  const input = JSON.parse(run.input_snapshot_json || "{}");
  const budget = budgetFor(input);
  const code = run.error_code || "";
  if (!["failed", "partial"].includes(run.status))
    return { allowed: false, stage: null, reason: "Run is not stopped." };
  if (code === "BUDGET_EXHAUSTED" || run.llm_calls >= budget.llmCalls)
    return {
      allowed: false,
      stage: null,
      reason:
        "Ngân sách run đã hết. Hãy tạo lượt nghiên cứu mới; retry không đặt lại ngân sách.",
    };
  const canCollect =
    run.search_calls < budget.searchCalls &&
    sourceCount < (input.numberOfSources || 12);
  let stage = run.current_stage || "verifying";
  if (
    /NO_VERIFIABLE_EVIDENCE|NO_REPORT_CITATIONS|INVALID_EVIDENCE_PROVENANCE/.test(
      code,
    )
  )
    stage = canCollect ? "collecting" : "analyzing";
  else if (
    /REPORT_QUESTION_COVERAGE_GAP|INSUFFICIENT_EVIDENCE|REPORT_COMPOSED_WITH_GAPS/.test(
      code,
    )
  )
    stage =
      coverage === "sufficient"
        ? "composing"
        : canCollect
          ? "collecting"
          : "analyzing";
  else if (
    /REPORT_CLAIM_UNSUPPORTED|UNREGISTERED_REPORT_CONTENT|CITATION_STRUCTURE_INVALID|INVALID_REPORT_CLAIMS/.test(
      code,
    )
  )
    stage = "composing";
  if (stage === "collecting" && run.search_calls >= budget.searchCalls)
    return {
      allowed: false,
      stage: null,
      reason:
        "Ngân sách tìm kiếm đã hết; tạo lượt nghiên cứu mới để bổ sung nguồn.",
    };
  return {
    allowed: true,
    stage,
    reason: `Chạy lại từ ${stage}; giữ nguồn, bằng chứng và bộ đếm ngân sách. Lỗi cấu hình cần được sửa trước khi thử lại.`,
  };
}
module.exports = { retryPolicy };
