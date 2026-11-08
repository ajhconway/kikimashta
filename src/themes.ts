import type { DensityLevel } from './core/density';

// Give each new quiz type its own named theme here.
export const themeColors = {
  home: '#ffe4cc',
  lesson: '#ffa9d4',
  pictureQuiz: '#c4a2ff',
} as const;

export const quizFeedbackColors = {
  correct: '#e9b6ff',
  incorrect: '#b8a4cf',
} as const;

export const intensityColors: Record<DensityLevel, string> = {
  minimal: '#d9c1f4',
  light: '#ffcb78',
  moderate: '#ff89b3',
  high: '#aa72ff',
  intense: '#e655be',
};
