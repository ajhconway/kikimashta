# Listening practice app plan

A personal listening game, starting with Japanese and leaving room for other languages. Focused and chill, with understated charm. V0 should feel good enough to repeat; complete polish can come later.

## V0 experience

- A fixed mixed word bank organized into themes such as food, animals, and household objects. Default starting level: some basics.
- Introduce words with pictures and Japanese audio, then offer short, untimed sessions: hear a word and choose one of *k* pictures.
- Give clear feedback and a satisfying session ending. Save per-word results and individual practice attempts.
- Use pictures and audio by default. Require an internet connection initially.

## Implementation

| Part | Choice |
| --- | --- |
| App | React, TypeScript, and Vite; prioritize Safari on iPhone 17 |
| Local progress | IndexedDB, with stable item and attempt IDs, answers, picture choices, and timing |
| Content | JSON files and media in the repository; separate word banks and progress by language |
| Audio | Reusable, pregenerated speech; choose the voice and provider by comparing samples |
| Pictures | Start with AI-generated illustrations; also support library images and reuse suitable pictures across languages |
| Hosting | Public GitHub repository, GitHub Actions, and GitHub Pages |
| Code license | MIT |

Keep the quiz interface, learning rules, and storage separate so each can evolve. Speech providers can vary by language.

Coordinate agent work through [AGENTS.md](AGENTS.md), GitHub Issues, and linked pull requests.

## Testing

- Use Vitest for quiz rules, content validation, and progress logic, plus React Testing Library for user interactions. Keep these tests beside the code.
- Keep a small Playwright suite in `e2e/`, checking the built app in WebKit and Chromium. Cover a complete session, real IndexedDB persistence after reload, and important failure paths.
- Keep tests readable, isolated, and deterministic, with small fixtures and controlled time and randomness. Assert observable behavior, mock external boundaries, and fix flaky tests. Use coverage to find important gaps.
- Each agent includes relevant tests with its changes. Review test quality and integration; require lint, type checks, tests, and a production build in GitHub Actions before merging or deploying.
- Check pronunciation, playback, touch interactions, and layout on the actual iPhone at playable milestones and before releases.

## Current priorities

V0 is playable. Refine it in this order, reviewing each pass before moving on:

1. **Visuals:** minimal, brighter purple/pink/orange, and more cartoony and game-like, with distinct background colors for lessons and each quiz type.
2. **Audio:** replace the low-quality voice after comparing better samples.
3. **Interactions:** more fun, engaging, fast-paced, and natural.

Then add Supabase sign-in and cross-device sync, carrying forward existing progress.

Later, add adaptive review scheduling and introduce new words as mastery improves. Sessions can then continue until no practice items are available. Add offline practice, decreasing answer time limits, delayed-picture and sentence quizzes, and Japanese writing alongside audio and pictures. English text remains an option.

Keep *k*, word counts, session length, visual details, and the learning algorithm flexible.
