import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContextualBank, ContextualItem, ContextualPrompt } from '../content/contextual-types';
import type { WordItem } from '../types';
import { ProgressStore } from '../progress/store';
import { ContextualDevReview } from './ContextualDevReview';

const word = (id: string, text: string): WordItem => ({ id, text, language: 'ja-JP', theme: 'test', label: id,
  image: { src: `images/${id}.png`, source: 'generated', alt: id }, audio: [] });
const vocabulary = [word('water', '水'), word('coffee', 'コーヒー'), word('teacher', '先生'), word('student', '学生')];
const prompt = (text: string, meaning = text): ContextualPrompt => ({ text, reading: text, meaning, grammarTags: [], supportingVocabularyIds: [] });
const banks: ContextualBank[] = ['simple', 'contrastive'].map(stage => ({
  schemaVersion: 1, id: `test-${stage}`, language: 'ja-JP', grammarProfile: 'genki-1', grammarReference: 'reference', grammarPoints: [], supportingVocabulary: [],
  contexts: ['water', 'coffee'].map((targetItemId, index) => {
    const id = `${stage}-${targetItemId}`;
    const recorded = stage === 'simple' && index === 0;
    return {
      id, revision: 1, stage: stage as 'simple' | 'contrastive', targetItemId, targetOccurrence: { surface: '水', reading: 'みず' },
      sentence: prompt(`${id}の文。`, `Sentence ${id}`),
      questions: ['target', 'detail'].map(kind => ({
        id: `${id}-${kind}`, revision: 1, kind: kind as 'target' | 'detail', prompt: prompt(`${id}-${kind}の質問。`, `Question ${id}-${kind}`),
        formats: recorded ? ['picture', 'text'] : ['text'],
        options: (kind === 'target' ? vocabulary.slice(0, 2) : vocabulary.slice(2)).map(item => ({
          id: item.id, imageItemId: item.id, vocabularyItemId: item.id, ...prompt(item.text, item.label),
        })), correctOptionId: kind === 'target' ? targetItemId : 'teacher', explanation: 'Fixture answer.',
      })),
      recordings: recorded ? ['otani', 'morioki'].map(voice => ({ id: voice, voice, sentenceSrc: `audio/${voice}-sentence.mp3`,
        questionSrcs: { [`${id}-target`]: `audio/${voice}-target.mp3`, [`${id}-detail`]: `audio/${voice}-detail.mp3` } })) : [],
      review: { text: recorded ? 'approved' : 'pending', audio: recorded ? 'approved' : 'not-generated' }, reviewNotes: 'Fixture.',
    } as ContextualItem;
  }),
}));
const close = vi.fn();
const click = async (element: Element) => { await act(async () => { fireEvent.click(element); }); };
const select = async (name: string, value: string) => { await act(async () => { fireEvent.change(screen.getByLabelText(name), { target: { value } }); }); };
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  close.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('complete contextual dev review', () => {
  it('starts with simple contexts even when the contrastive bank is supplied first', () => {
    const view = render(<ContextualDevReview banks={[...banks].reverse()} vocabulary={vocabulary} onClose={close}/>);
    expect(view.container.querySelector('[data-question-id]')).toHaveAttribute('data-question-id', 'simple-water-target');
  });

  it('includes every authored question and supports direct and adjacent navigation', async () => {
    const view = render(<ContextualDevReview banks={banks} vocabulary={vocabulary} onClose={close}/>);
    expect(screen.getByText(/Question 1 of 8/)).toBeInTheDocument();
    expect(screen.getByLabelText('Jump to question').querySelectorAll('option')).toHaveLength(8);
    const visited = [];
    for (let index = 0; index < 8; index++) {
      await select('Jump to question', String(index));
      visited.push(view.container.querySelector('[data-question-id]')!.getAttribute('data-question-id'));
    }
    expect(new Set(visited).size).toBe(8);
    await click(screen.getByRole('button', { name: 'Previous question' }));
    expect(screen.getByText(/Question 7 of 8/)).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Next question' }));
    expect(screen.getByText(/Question 8 of 8/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next question' })).toBeDisabled();
  });

  it('filters by stage, target, kind and supported answer format without losing draft inspection', async () => {
    render(<ContextualDevReview banks={banks} vocabulary={vocabulary} onClose={close}/>);
    await select('Stage', 'simple'); expect(screen.getByText(/Question 1 of 4/)).toBeInTheDocument();
    await select('Target word', 'coffee'); expect(screen.getByText(/Question 1 of 2/)).toBeInTheDocument();
    await select('Question kind', 'detail'); expect(screen.getByText(/Question 1 of 1/)).toBeInTheDocument();
    expect(screen.getByText('Text inspection · audio not available')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Show text for inspection' }));
    expect(screen.getByText('Question simple-coffee-detail')).toBeInTheDocument();
    await select('Answer format', 'picture');
    expect(screen.getByRole('status')).toHaveTextContent('No questions match these filters.');
    await select('Target word', 'water');
    expect(screen.getByText(/Question 1 of 1/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Choose picture/ })).toHaveLength(2);
  });

  it('lets reviewers choose a voice and retains it through replay', async () => {
    const view = render(<ContextualDevReview banks={banks} vocabulary={vocabulary} onClose={close}/>);
    await select('Voice', 'morioki');
    expect(view.container.querySelector('audio')).toHaveAttribute('src', '/audio/morioki-sentence.mp3');
    await click(screen.getByRole('button', { name: 'Replay sentence and question' }));
    expect(view.container.querySelector('audio')).toHaveAttribute('src', '/audio/morioki-sentence.mp3');
  });

  it('shows feedback and complete coverage without saving attempts or preferences', async () => {
    const record = vi.spyOn(ProgressStore.prototype, 'record');
    const preferences = vi.spyOn(Storage.prototype, 'setItem');
    render(<ContextualDevReview banks={banks} vocabulary={vocabulary} onClose={close}/>);
    await select('Stage', 'simple'); await select('Target word', 'water'); await select('Question kind', 'detail');
    await click(screen.getByText('先生').closest('button')!);
    expect(screen.getByText('Correct', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Question simple-water-detail')).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('heading', { name: 'Review complete' })).toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Review again' }));
    expect(screen.queryByText('Correct', { exact: true })).not.toBeInTheDocument();
    await click(screen.getByRole('button', { name: 'Close contextual review' }));
    expect(close).toHaveBeenCalledOnce();
    expect(record).not.toHaveBeenCalled(); expect(preferences).not.toHaveBeenCalled();
  });
});
