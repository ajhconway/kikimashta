import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import spanish from '../content/es-419.json';
import { ProgressStore } from './progress/store';
import type { PracticeAttempt } from './types';

vi.mock('./core/density', async importOriginal => {
  const actual = await importOriginal<typeof import('./core/density')>();
  const forecast = { reviewsPerDay: 0, daily: [0, 0, 0, 0, 0, 0, 0], horizonDays: 7, scenarios: 32 };
  return { ...actual, forecastDensity: vi.fn().mockResolvedValue(forecast),
    planLessonChunk: vi.fn().mockImplementation(async ({ candidates }) => ({ items: candidates.slice(0, 10), forecast, projectedForecast: forecast, reason: 'below-min' })),
  };
});
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(ProgressStore.prototype, 'history').mockResolvedValue([]);
});

it.each(['pictures', 'writing'])('saves Spanish %s answers with Spanish-only choices once recordings exist', async format => {
  localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify([`es-419-travel-1-${format}`]));
  const saved: PracticeAttempt[] = [];
  vi.spyOn(ProgressStore.prototype, 'record').mockImplementation(async attempt => { saved.push(attempt); });
  const { container } = render(<App now={() => 1000000} random={() => 0.5}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: /^start/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Begin lesson' }));
  while (screen.queryByRole('button', { name: /next card/i })) {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /next card/i })); });
  }
  fireEvent.click(screen.getByRole('button', { name: /mini-quiz/i }));
  const source = container.querySelector('audio')!.getAttribute('src')!;
  const target = spanish.items.find(item => item.audio.some(clip => source.endsWith(clip.src)))!;
  const button = screen.getAllByRole('button', { name: /choose (picture|writing)/i }).find(button =>
    format === 'pictures' ? within(button).queryByRole('img', { name: target.image.alt }) : within(button).queryByText(target.text, { exact: true }))!;
  await act(async () => { fireEvent.click(button); });
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({ language: 'es-419', itemId: target.id, correct: true,
    context: { exercise: format === 'pictures' ? 'audio-picture' : 'audio-text' } });
  expect(saved[0]!.choiceIds.every(id => spanish.items.some(item => item.id === id))).toBe(true);
  if (format === 'writing') expect(container.querySelector('.written-answer')).toHaveAttribute('data-font', 'system');
});
