module.exports = async (ctx) => {
  // Give each question its first query before spending budget on extra variants.
  const first = ctx.plan.researchQuestions.map(
    (q) =>
      ctx.plan.searchQueries.find((item) => item.questionId === q.id)?.query ||
      `${ctx.input.topic} ${q.question}`,
  );
  const gaps =
    ctx.previousEvaluation?.coverage !== "sufficient"
      ? ctx.previousEvaluation?.gaps || []
      : [];
  const targeted =
    ctx.previousEvaluation?.action === "search_more"
      ? ctx.previousEvaluation.additional_queries
      : gaps.map((q) => `${ctx.input.topic} ${q.question}`);
  const queries = [
    ...new Set([
      ...targeted,
      ...first,
      ...ctx.plan.searchQueries.map((q) => q.query),
    ]),
  ];
  return ctx.provider.collect(ctx, queries, ctx.sources);
};
