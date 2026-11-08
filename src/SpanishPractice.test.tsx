import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import spanish from '../content/es-419.json';
import { forecastDensity } from './core/density';
import { schedulerVersion } from './core/scheduler';
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
  window.history.replaceState({}, '', '/');
  localStorage.clear();
  localStorage.setItem('kikimashta-learning-language-v1', 'es-419');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(ProgressStore.prototype, 'history').mockResolvedValue([]);
});

it('saves Spanish picture answers with Spanish-only choices', async () => {
  localStorage.setItem('kikimashta-card-packs-v1:es-419', JSON.stringify(['es-419-travel-1-pictures']));
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
    within(button).queryByRole('img', { name: target.image.alt }))!;
  await act(async () => { fireEvent.click(button); });
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toMatchObject({ language: 'es-419', itemId: target.id, correct: true,
    context: { exercise: 'audio-picture' } });
  expect(saved[0]!.choiceIds.every(id => spanish.items.some(item => item.id === id))).toBe(true);
  expect(screen.queryByRole('button', { name: /choose writing/i })).not.toBeInTheDocument();
});


it('keeps the Japanese contextual shortcut out of Spanish practice', async () => {
  window.history.replaceState({}, '', '/?review=contextual');
  try {
    render(<App now={() => 1000000}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: /^start/i })).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Contextual dev review' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /contextual dev review/i })).not.toBeInTheDocument();
  } finally { window.history.replaceState({}, '', '/'); }
});

it('loads Spanish picture history and links to its language-specific pack library', async () => {
  vi.mocked(ProgressStore.prototype.history).mockResolvedValue(spanish.items.map(item => ({
    id: item.id, sessionId: 'spanish-lesson', itemId: item.id, language: 'es-419',
    choiceIds: [item.id], selectedId: item.id, correct: true, startedAt: 900, answeredAt: 1000, responseMs: 100,
    context: { phase: 'lesson', exercise: 'audio-picture', recordingSrc: item.audio[0]!.src, replays: 0, schedulerVersion },
  })));
  render(<App now={() => 1000000}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start · 0 reviews' })).toBeEnabled());
  const schedules = vi.mocked(forecastDensity).mock.calls.at(-1)![0];
  expect(schedules).toHaveLength(spanish.items.length);
  expect(schedules.every(card => card.language === 'es-419' && spanish.items.some(item => item.id === card.itemId))).toBe(true);
  expect(ProgressStore.prototype.history).toHaveBeenCalledWith('es-419');
  expect(screen.getByRole('link', { name: 'Card library · 1 pack selected' })).toHaveAttribute('href', expect.stringContaining('language=es-419'));
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('runs a Spanish-only simulated dev review without saving practice', async () => {
  const record = vi.spyOn(ProgressStore.prototype, 'record').mockResolvedValue(undefined);
  const { container } = render(<App now={() => 1000000} random={() => 0.5}/>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Dev review' })).toBeEnabled());
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dev review' })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start dev review' })); });
  const source = container.querySelector('audio')!.getAttribute('src')!;
  const target = spanish.items.find(item => item.audio.some(clip => source.endsWith(clip.src)))!;
  expect(target).toBeDefined();
  const answer = screen.getAllByRole('button', { name: /choose picture/i }).find(button =>
    within(button).queryByRole('img', { name: target.image.alt }))!;
  await act(async () => { fireEvent.click(answer); });
  expect(record).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /choose writing/i })).not.toBeInTheDocument();
});
