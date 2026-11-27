// Per-run hard limits include failed requests and manual retries. Sequential calls only.
const profiles = {
  short: {
    searchCalls: 5,
    llmCalls: 16,
    chunksPerQuestion: 3,
    evidencePerQuestion: 3,
    claimsPerQuestion: 4,
    maxOutputTokens: 2048,
    targetWords: [400, 700],
  },
  medium: {
    searchCalls: 6,
    llmCalls: 24,
    chunksPerQuestion: 5,
    evidencePerQuestion: 6,
    claimsPerQuestion: 8,
    maxOutputTokens: 4096,
    targetWords: [1200, 2000],
  },
  long: {
    searchCalls: 8,
    llmCalls: 36,
    chunksPerQuestion: 7,
    evidencePerQuestion: 10,
    claimsPerQuestion: 12,
    maxOutputTokens: 8192,
    targetWords: [2500, 4000],
  },
};
function budgetFor(input = {}) {
  return profiles[input.outputLength] || profiles.medium;
}
module.exports = { budgetFor };
