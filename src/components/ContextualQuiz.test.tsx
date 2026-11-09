import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextualItem, ContextualPrompt, ContextualQuestion } from '../content/contextual-types';
import type { PracticeAttempt, WordItem } from '../types';
import { contextualQuestion } from '../core/contextual-questions';
import type { Question } from '../core/session';
import { ContextualQuiz } from './ContextualQuiz';

const word = (id: string, text: string): WordItem => ({ id, text, language: 'ja-JP', theme: 'test', label: id,
  image: { src: `images/${id}.png`, source: 'generated', alt: id }, audio: [] });
const vocabulary = [word('water', '水'), word('teacher', '先生'), word('student', '学生')];
const prompt = (text: string, meaning: string): ContextualPrompt => ({ text, reading: text, meaning, grammarTags: [], supportingVocabularyIds: [] });
function fixture({ recorded = true, id = 'who-drinks', format = 'text' }: {
  recorded?: boolean; id?: string; format?: 'text' | 'picture';
} = {}) {
  const authored: ContextualQuestion = { id, revision: 1, kind: 'detail', prompt: prompt('誰が水を飲みますか。', 'Who drinks water?'), formats: ['text', 'picture'],
    options: [{ id: 'teacher-answer', imageItemId: 'teacher', ...prompt('先生', 'teacher') }, { id: 'student-answer', imageItemId: 'student', ...prompt('学生', 'student') }],
    correctOptionId: 'teacher-answer', explanation: 'The teacher drinks water.' };
  const context: ContextualItem = { id: 'teacher-water', revision: 1, stage: 'simple', targetItemId: 'water', targetOccurrence: { surface: '水', reading: 'みず' },
    sentence: prompt('先生は水を飲みます。', 'The teacher drinks water.'), questions: [authored],
    recordings: recorded ? [{ id: 'otani', voice: 'otani', sentenceSrc: 'audio/sentence.mp3', questionSrcs: { [id]: `audio/${id}.mp3` } }] : [],
    review: { text: recorded ? 'approved' : 'pending', audio: recorded ? 'approved' : 'not-generated' }, reviewNotes: 'Fixture.' };
  return contextualQuestion(context, authored, format, vocabulary, () => 0);
}
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
const onChoose = vi.fn();
const onContinue = vi.fn();
function Harness({ question = fixture() }: { question?: Question }) {
  const [feedback, setFeedback] = useState<PracticeAttempt | null>(null);
  return <ContextualQuiz question={question} feedback={feedback} onContinue={onContinue} onChoose={choice => {
    onChoose(choice);
    setFeedback({ id: 'attempt', sessionId: 'session', itemId: question.target.id, language: 'ja-JP',
      choiceIds: question.choices.map(option => option.id), selectedId: choice.id, correct: choice.id === 'teacher-answer',
      startedAt: 0, answeredAt: 1, responseMs: 1 });
  }}/>;
}
const click = async (element: Element) => { await act(async () => { fireEvent.click(element); }); };
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  onChoose.mockReset(); onContinue.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks();
  for (const [name, descriptor] of [['showModal', originalShow], ['close', originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

describe('contextual listening and feedback', () => {
  it.each(['text', 'picture'] as const)('lets screen-reader users identify and select %s answers by their content', async format => {
    render(<Harness question={fixture({ format })}/>);
    const teacher = format === 'text' ? 'Choose writing 先生' : /^Choose picture \d+: teacher$/;
    const student = format === 'text' ? 'Choose writing 学生' : /^Choose picture \d+: student$/;
    expect(screen.getByRole('button', { name: student })).toBeEnabled();
    await click(screen.getByRole('button', { name: teacher }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 'teacher-answer' }));
    expect(screen.getByText('Correct', { exact: true })).toBeInTheDocument();
  });

  it('plays sentence then the question after 650 ms and replays the same pair', async () => {
    const onReplay = vi.fn();
    const { container } = render(<ContextualQuiz question={fixture()} feedback={null} onChoose={onChoose} onContinue={onContinue} onReplay={onReplay}/>);
    const audio = container.querySelector('audio')!;
    expect(audio).toHaveAttribute('src', '/audio/sentence.mp3');
    fireEvent.ended(audio); await advance(649);
    expect(audio).toHaveAttribute('src', '/audio/sentence.mp3');
    await advance(1); expect(audio).toHaveAttribute('src', '/audio/who-drinks.mp3');
    fireEvent.ended(audio);
    await click(screen.getByRole('button', { name: 'Replay sentence and question' }));
    expect(audio).toHaveAttribute('src', '/audio/sentence.mp3');
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it('keeps correct feedback compact without revealing Japanese or English', async () => {
    const { container } = render(<Harness/>);
    expect(screen.queryByText('Who drinks water?')).not.toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Choose writing 先生' }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: 'teacher-answer' }));
    expect(screen.getByText('Correct', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Who drinks water?')).not.toBeInTheDocument();
    expect(screen.queryByText('先生は水を飲みます。')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Japanese' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-correct=true]')).toHaveAttribute('data-selected', 'true');
  });

  it('reveals Japanese then optional English after a miss and restores focus when closed', async () => {
    render(<Harness/>);
    await click(screen.getByText('学生').closest('button')!);
    expect(screen.getByText('Keep going', { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Show Japanese' });
    await click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Japanese' });
    expect(within(dialog).getByText('先生は水を飲みます。')).toBeVisible();
    expect(within(dialog).getByText('Who drinks water?')).toHaveAttribute('aria-hidden', 'true');
    expect(within(dialog).getByText('The teacher drinks water.')).toHaveAttribute('aria-hidden', 'true');
    await click(within(dialog).getByRole('button', { name: 'Show English' }));
    expect(within(dialog).getByText('Who drinks water?')).toBeVisible();
    await click(within(dialog).getByRole('button', { name: 'Close Japanese' }));
    expect(trigger).toHaveFocus();
    await click(trigger);
    expect(within(screen.getByRole('dialog')).getByText('Who drinks water?')).toHaveAttribute('aria-hidden', 'true');
    await click(screen.getByRole('button', { name: 'Close Japanese' }));
    await advance(10000); expect(onContinue).not.toHaveBeenCalled();
    await click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('accepts only the first of rapid answer taps', async () => {
    render(<Harness/>);
    const buttons = screen.getAllByRole('button', { name: /Choose writing/ });
    await act(async () => { fireEvent.click(buttons[0]!); fireEvent.click(buttons[1]!); });
    expect(onChoose).toHaveBeenCalledOnce();
  });

  it.each(['sentence', 'question'])('blocks answers after a %s failure and recovers through a whole-pair replay', async segment => {
    const { container } = render(<Harness/>);
    const audio = container.querySelector('audio')!;
    if (segment === 'question') { fireEvent.ended(audio); await advance(650); }
    fireEvent.error(audio);
    expect(screen.getByRole('alert')).toHaveTextContent('The sound couldn’t play');
    screen.getAllByRole('button', { name: /Choose writing/ }).forEach(button => expect(button).toBeDisabled());
    await click(screen.getByRole('button', { name: 'Replay sentence and question' }));
    expect(audio).toHaveAttribute('src', '/audio/sentence.mp3');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    screen.getAllByRole('button', { name: /Choose writing/ }).forEach(button => expect(button).toBeEnabled());
  });

  it('ignores an older rejected play promise after replay', async () => {
    let reject!: (error: Error) => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise<void>((_resolve, no) => { reject = no; }));
    render(<Harness/>);
    await click(screen.getByRole('button', { name: 'Replay sentence and question' }));
    await act(async () => { reject(new Error('Old request')); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('prompts for replay when autoplay needs a gesture and recovers without reporting broken audio', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('A user gesture is required.', 'NotAllowedError'));
    const { container } = render(<Harness/>);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Ready to listen. Tap Replay');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    screen.getAllByRole('button', { name: /Choose writing/ }).forEach(button => expect(button).toBeDisabled());
    await click(screen.getByRole('button', { name: 'Replay sentence and question' }));
    expect(container.querySelector('audio')).toHaveAttribute('src', '/audio/sentence.mp3');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    screen.getAllByRole('button', { name: /Choose writing/ }).forEach(button => expect(button).toBeEnabled());
  });

  it('cancels the gap on unmount and on hiding the page', async () => {
    const view = render(<Harness/>);
    fireEvent.ended(view.container.querySelector('audio')!);
    view.unmount(); await advance(650);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
    const second = render(<Harness/>);
    fireEvent.ended(second.container.querySelector('audio')!);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange')); await advance(650);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Playback paused');
  });

  it('cancels an old question gap when its question changes', async () => {
    const view = render(<ContextualQuiz question={fixture()} feedback={null} onChoose={onChoose} onContinue={onContinue}/>);
    fireEvent.ended(view.container.querySelector('audio')!);
    view.rerender(<ContextualQuiz question={fixture({ id: 'new-question' })} feedback={null} onChoose={onChoose} onContinue={onContinue}/>);
    await advance(650);
    expect(view.container.querySelector('audio')).toHaveAttribute('src', '/audio/sentence.mp3');
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it('marks missing audio as inspection and requires showing text before evaluating answers', async () => {
    render(<Harness question={fixture({ recorded: false })}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Text inspection · audio not available');
    screen.getAllByRole('button', { name: /Choose writing/ }).forEach(button => expect(button).toBeDisabled());
    await click(screen.getByRole('button', { name: 'Show text for inspection' }));
    expect(screen.getByText('Who drinks water?')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Choose writing 先生' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

});
