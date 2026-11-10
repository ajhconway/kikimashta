export function selectAnswer(question, choiceId, answers) {
  if (!question.choices.some(choice => choice.id === choiceId)) throw new Error('Unknown answer');
  if (Object.hasOwn(answers, question.id)) return answers;
  return { ...answers, [question.id]: choiceId };
}
export function summarize(questions, answers) {
  return { answered: questions.filter(q => Object.hasOwn(answers, q.id)).length,
    correct: questions.filter(q => answers[q.id] === q.correct).length,
    total: questions.length };
}
