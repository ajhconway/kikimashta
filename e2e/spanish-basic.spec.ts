import { expect, test } from './fixtures';
import { savedAttempts } from './saved-attempts';
import draft from '../content/spanish-basic-1/draft.json' with { type: 'json' };
import { advanceSchedule } from '../src/core/scheduler';

test('Basic Spanish introduces abstract vocabulary directly and persists its independent contextual review', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.5;
    localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
    localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify(['es-419-basic-1-pictures']));
  });
  await page.goto('./');
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  await expect(page.locator('.foundation-introduction')).toBeVisible();
  const targetText = await page.locator('.foundation-introduction h2').innerText();
  const target = draft.items.find(item => item.text === targetText)!;
  const context = draft.contexts.find(context => context.targetItemId === target.id)!;
  await expect(page.locator('.foundation-introduction')).toContainText(target.meaning);
  await expect(page.locator('.foundation-introduction')).toContainText(context.sentence.meaning);
  await expect(page.locator('.contextual-choices')).toHaveCount(0);
  await page.getByRole('button', { name: 'Listen and answer' }).click();
  const quiz = page.locator('.contextual-quiz');
  await expect(quiz).toHaveAttribute('data-question-id', context.id + '-question');
  await expect(quiz.locator('audio')).toHaveAttribute('src', /\/es-419-basic-1\//);
  const correct = context.options.find(option => option.id === context.correctOptionId)!;
  await quiz.getByRole('button', { name: new RegExp('Choose picture \\d+: ' + correct.meaning + '$') }).click();
  await expect.poll(async () => (await savedAttempts(page, 'es-419')).length).toBe(1);
  const attempt = (await savedAttempts(page, 'es-419'))[0]!;
  expect(attempt.itemId).toBe(target.id);
  expect(attempt.context).toMatchObject({ phase: 'lesson', exercise: 'context-simple-picture', contextual: { stage: 'simple', contextId: context.id } });
  expect(await savedAttempts(page, 'ja-JP')).toEqual([]);
  const schedule = await advanceSchedule(undefined, attempt);
  await page.clock.install({ time: new Date(schedule.dueAt + 1000) });
  await page.goto('./');
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Begin review', exact: true }).click();
  // At most three new contexts can precede the saved due card in this fixed session.
  for (let index = 0; index < 4; index++) {
    if (await page.locator('.foundation-introduction').isVisible()) await page.getByRole('button', { name: 'Listen and answer' }).click();
    const questionId = await quiz.getAttribute('data-question-id');
    if (questionId === context.id + '-question') {
      await expect(page.locator('.foundation-introduction')).toHaveCount(0);
      await quiz.getByRole('button', { name: new RegExp('Choose picture \\d+: ' + correct.meaning + '$') }).click();
      await expect.poll(async () => (await savedAttempts(page, 'es-419')).filter(saved => saved.itemId === target.id).length).toBe(2);
      expect((await savedAttempts(page, 'es-419')).find(saved => saved.itemId === target.id && saved.id !== attempt.id)!.context!.phase).toBe('review');
      return;
    }
    const other = draft.contexts.find(candidate => candidate.id + '-question' === questionId)!;
    const answer = other.options.find(option => option.id === other.correctOptionId)!;
    await quiz.getByRole('button', { name: new RegExp('Choose picture \\d+: ' + answer.meaning + '$') }).click();
    await page.clock.fastForward(2000);
  }
  throw new Error('Saved foundation review was not in the scoped session.');
});
