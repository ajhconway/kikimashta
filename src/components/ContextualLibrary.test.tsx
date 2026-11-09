import { fireEvent, screen, within } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContextualBank, ContextualItem, ContextualPrompt } from '../content/contextual-types';
import type { WordItem } from '../types';

const content = vi.hoisted(() => ({ banks: [] as ContextualBank[], vocabulary: [] as WordItem[] }));
vi.mock('../content/contextual-runtime', () => ({ contextualBanks: content.banks, contextualVocabulary: content.vocabulary }));
interface Gallery { stop: () => void }
interface Module { mountContextualLibrary: (options: { container: HTMLElement; language: { id: string } }) => Gallery }
const audios: HTMLAudioElement[] = [];
const mounted: Gallery[] = [];
const listeners: { target: Window | Document; type: string; listener: EventListenerOrEventListenerObject }[] = [];
const prompt = (text: string, meaning = text): ContextualPrompt => ({ text, reading: text + 'よみ', meaning, grammarTags: [], supportingVocabularyIds: [] });
const word = (id: string, text: string): WordItem => ({ id, text, label: id, language: 'ja-JP', theme: 'test',
  image: { src: `images/${id}.png`, alt: id, source: 'generated' }, audio: [] });
function context(index: number): ContextualItem {
  const id = 'context-' + index;
  return { id, revision: 3, stage: index % 2 ? 'contrastive' : 'simple', targetItemId: index % 2 ? 'coffee' : 'water',
    targetOccurrence: { surface: '水', reading: 'みず' }, sentence: prompt(`先生は水を飲みます${index}。`, `Sentence ${index}`),
    questions: [{ id: `question-${index}`, revision: 2, kind: index % 2 ? 'detail' : 'target',
      prompt: prompt(`何を飲みますか${index}。`, `Question ${index}`), formats: index % 2 ? ['text'] : ['picture', 'text'],
      options: ['water', 'coffee', 'teacher', 'student'].map(value => ({ id: `answer-${value}`, imageItemId: value, ...prompt(value, value + ' meaning') })),
      correctOptionId: 'answer-water', explanation: 'The answer is water.' }],
    recordings: ['otani', 'morioki'].map(voice => ({ id: voice, voice, sentenceSrc: `audio/${id}/${voice}/sentence.mp3`, questionSrcs: { [`question-${index}`]: `audio/${id}/${voice}/question.mp3` } })),
    review: { text: 'approved', audio: 'approved' }, reviewNotes: 'Authored fixture.' };
}
const bank = (contexts: ContextualItem[]): ContextualBank => ({ id: 'fixtures', schemaVersion: 1, language: 'ja-JP', grammarProfile: 'genki-1', grammarReference: '', grammarPoints: [], supportingVocabulary: [], contexts });
async function mount(language = 'ja-JP') {
  const container = document.createElement('div');
  document.body.append(container);
  const { mountContextualLibrary } = await vi.importActual<Module>('../../vocabulary/contextual.js');
  const gallery = mountContextualLibrary({ container, language: { id: language } });
  mounted.push(gallery);
  return { container, gallery };
}
function choose(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
const playButton = (id = 'question-0', voice = 'Otani') => screen.getByRole('button', { name: `Play ${voice}: ${id}` });
const playback = () => document.querySelector('.context-playback-status')!;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  content.banks.splice(0, content.banks.length, bank(Array.from({ length: 14 }, (_, index) => context(index))));
  content.vocabulary.splice(0, content.vocabulary.length, word('water', '水'), word('coffee', 'コーヒー'), word('teacher', '先生'), word('student', '学生'));
  audios.splice(0);
  vi.stubGlobal('Audio', vi.fn(function () { const audio = document.createElement('audio'); audios.push(audio); return audio; }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const windowAdd = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => { if (listener) listeners.push({ target: window, type, listener }); windowAdd(type, listener, options); });
  const documentAdd = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => { if (listener && type === 'visibilitychange') listeners.push({ target: document, type, listener }); documentAdd(type, listener, options); });
});
afterEach(() => {
  mounted.splice(0).forEach(gallery => gallery.stop());
  listeners.splice(0).forEach(({ target, type, listener }) => target.removeEventListener(type, listener));
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('renders bounded authored cards, meanings, correct options, pictures and revision details without autoplay or writes', async () => {
  const save = vi.spyOn(Storage.prototype, 'setItem');
  const { container } = await mount();
  const cards = screen.getAllByRole('article');
  expect(cards).toHaveLength(12);
  expect(screen.getByText('14 contextual questions')).toBeVisible();
  const first = within(cards[0]!);
  expect(first.getByText('先生は水を飲みます0。')).toBeVisible();
  expect(first.getByText('Sentence 0')).toBeVisible();
  expect(first.getByText('Question 0')).toBeVisible();
  const correct = first.getByText('Correct answer').closest('li')!;
  expect(within(correct).getByText('water')).toBeVisible();
  expect(within(correct).getByRole('img', { name: 'water' })).toHaveAttribute('src', '/images/water.png');
  fireEvent.click(first.getByText('Content details'));
  expect(first.getByText('Sentence: context-0 · revision 3')).toBeVisible();
  expect(first.getByText('Question: question-0 · revision 2')).toBeVisible();
  expect(container.querySelectorAll('.card')).toHaveLength(0);
  expect(audios).toHaveLength(0);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

it('filters stage, target, kind, format, voice and search, resetting pagination while keeping hide/show selections', async () => {
  const { container, gallery } = await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Next contextual page' }));
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Previous contextual page' })).toHaveFocus();
  choose('Context stage', 'simple');
  expect(screen.getByText('Page 1 of 1')).toBeVisible();
  expect(screen.getAllByRole('article')).toHaveLength(7);
  choose('Context target', 'coffee');
  expect(screen.getByText('No contextual cards match these filters.')).toBeVisible();
  choose('Context target', 'water');
  choose('Question kind', 'detail');
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  choose('Question kind', 'target');
  choose('Answer format', 'picture');
  choose('Context voice', 'morioki');
  expect(screen.getAllByRole('button', { name: /^Play Morioki:/ })).toHaveLength(7);
  expect(screen.queryByRole('button', { name: /^Play Otani:/ })).not.toBeInTheDocument();
  fireEvent.input(screen.getByLabelText('Search contexts'), { target: { value: 'Question 12' } });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(container.querySelector('article')).toHaveAttribute('data-question-id', 'question-12');
  gallery.stop(); container.hidden = true; container.hidden = false;
  expect(screen.getByLabelText('Search contexts')).toHaveValue('Question 12');
  expect(screen.getByLabelText('Context voice')).toHaveValue('morioki');
  expect(container.querySelector('article')).toHaveAttribute('data-question-id', 'question-12');
});

it('shows draft and missing-audio cards, escapes authored text, and never makes unsafe media playable', async () => {
  const draft = context(0);
  draft.review = { text: 'pending', audio: 'not-generated' };
  draft.sentence.text = '<img src=x onerror=alert(1)>';
  draft.recordings[0]!.sentenceSrc = 'https://unsafe.invalid/audio.mp3';
  draft.recordings[1]!.questionSrcs = {};
  content.banks.splice(0, content.banks.length, bank([draft]));
  const { container } = await mount();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
  expect(screen.getByText('Text awaiting review · Audio unavailable')).toBeVisible();
  expect(container.querySelector('[onerror]')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
  expect(screen.getAllByRole('article')).toHaveLength(1);
});

it('shows a clear empty-language state without creating audio or changing progress', async () => {
  await mount('es-419');
  expect(screen.getByText('No contextual cards are available in this language yet.')).toBeVisible();
  expect(screen.getByText('0 contextual questions')).toBeVisible();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(audios).toHaveLength(0);
});

it('plays the selected voice sentence then question after 650 ms with one shared native player', async () => {
  await mount();
  fireEvent.click(playButton('question-0', 'Morioki'));
  expect(audios).toHaveLength(1);
  const audio = audios[0]!;
  expect(audio.src).toContain('context-0/morioki/sentence.mp3');
  expect(playback()).toHaveTextContent('Playing sentence · Morioki');
  fireEvent.ended(audio);
  fireEvent.ended(audio);
  vi.advanceTimersByTime(649);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(audio.src).toContain('context-0/morioki/question.mp3');
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  fireEvent.ended(audio);
  expect(playback()).toHaveTextContent('Playback complete · Morioki');
  expect(playButton('question-0', 'Morioki')).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(playButton('question-2'));
  expect(audios).toHaveLength(1);
});

it.each(['sentence', 'question'])('reports a %s error and retries the whole recording pair', async segment => {
  await mount();
  fireEvent.click(playButton());
  const audio = audios[0]!;
  if (segment === 'question') { fireEvent.ended(audio); vi.advanceTimersByTime(650); }
  fireEvent.error(audio);
  expect(screen.getByRole('alert')).toHaveTextContent(`The ${segment} audio could not play`);
  expect(playButton()).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(playButton());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(audio.src).toContain('context-0/otani/sentence.mp3');
});

it.each(['stop', 'new play', 'filter', 'page', 'hide', 'pagehide', 'visibility'])('cancels the pending question on %s', async action => {
  const { gallery } = await mount();
  fireEvent.click(playButton());
  const audio = audios[0]!;
  fireEvent.ended(audio);
  if (action === 'stop') fireEvent.click(screen.getByRole('button', { name: 'Stop Otani: question-0' }));
  if (action === 'new play') fireEvent.click(playButton('question-2'));
  if (action === 'filter') choose('Context stage', 'contrastive');
  if (action === 'page') fireEvent.click(screen.getByRole('button', { name: 'Next contextual page' }));
  if (action === 'hide') gallery.stop();
  if (action === 'pagehide') fireEvent(window, new Event('pagehide'));
  if (action === 'visibility') { vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); fireEvent(document, new Event('visibilitychange')); }
  const played = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
  vi.advanceTimersByTime(5000);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(played);
  if (action === 'new play') expect(audio.src).toContain('context-2/otani/sentence.mp3');
  else expect(audio.getAttribute('src')).toBeNull();
});

it('ignores a stale play rejection after another card starts', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail; }));
  await mount();
  fireEvent.click(playButton());
  fireEvent.click(playButton('question-2'));
  reject(new Error('Old request failed'));
  await Promise.resolve();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(playback()).toHaveTextContent('Playing sentence · Otani');
  expect(audios[0]!.src).toContain('context-2/otani/sentence.mp3');
});
