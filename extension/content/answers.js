// AI drafting for free-text questions the classifier couldn't map.
// One batched call to POST /form-answers (no job id — jobs are captured only on
// submit, decision 3). Answers are held here and handed to index.js for the
// capture payload.

AA.answers = (() => {
  let lastBatch = []; // [{ question, answer }]

  async function draft(questions, jobContext) {
    if (!questions.length) return [];
    const res = await AA.bg("DRAFT_FORM_ANSWERS", { questions, job: jobContext });
    const answers = (res && res.answers) || [];
    lastBatch = questions.map((q, i) => ({ question: q, answer: answers[i] || "" }));
    return lastBatch;
  }

  const getLastBatch = () => lastBatch;
  const reset = () => {
    lastBatch = [];
  };

  return { draft, getLastBatch, reset };
})();
