const topical = require("./source-relevance.service");
function scoreChunk(query, content) {
  const context = topical.profile({ topic: query });
  const hit = topical.match(content, context);
  if (!hit.relevant) return 0;
  const actual = topical.canonical(content);
  const phrase = context.core.some(
    (word, i) =>
      i + 1 < context.core.length &&
      ` ${actual} `.includes(` ${word} ${context.core[i + 1]} `),
  );
  return Math.min(1, hit.score * 0.8 + (phrase ? 0.2 : 0));
}
function rankChunks(query, chunks) {
  return chunks
    .map((chunk) => ({
      ...chunk,
      relevanceScore: Number(scoreChunk(query, chunk.content).toFixed(4)),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
module.exports = { scoreChunk, rankChunks };

// Rank chunks only after source-level topical filtering. Score the question so a repeated topic cannot
// outrank a passage addressing the requested mechanism, example or application.
function rankQuestionChunks(topic, question, chunks) {
  const terms = [
    ...new Set(
      topical.words(question).filter((t) => !topical.words(topic).includes(t)),
    ),
  ];
  return chunks
    .map((chunk) => {
      const topicScore = scoreChunk(topic, chunk.content);
      const actual = new Set(topical.words(chunk.content));
      const hits = terms.filter((t) => actual.has(t)).length;
      const questionScore = terms.length ? hits / terms.length : topicScore;
      return {
        ...chunk,
        relevanceScore: Number(
          (topicScore > 0 || hits >= 2
            ? topicScore * 0.3 + questionScore * 0.7
            : 0
          ).toFixed(4),
        ),
      };
    })
    .filter((c) => c.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
module.exports.rankQuestionChunks = rankQuestionChunks;
