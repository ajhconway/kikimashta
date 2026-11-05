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
| Audio | Reusable, pregenerated speech; start with OpenAI Marin and Cedar, chosen through word and sentence samples |
| Pictures | Start with AI-generated illustrations; also support library images and reuse suitable pictures across languages |
| Hosting | Public GitHub repository, GitHub Actions, and GitHub Pages |
| Code license | GNU AGPLv3 only (AGPL-3.0-only); separately licensed media retain their terms |

Keep the quiz interface, learning rules, and storage separate so each can evolve. Speech providers can vary by language.

Coordinate agent work through [AGENTS.md](AGENTS.md), GitHub Issues, and linked pull requests.

## Testing

- Use Vitest for quiz rules, content validation, and progress logic, plus React Testing Library for user interactions. Keep these tests beside the code.
- Keep a small Playwright suite in `e2e/`, checking the built app in WebKit and Chromium. Cover a complete session, real IndexedDB persistence after reload, and important failure paths.
- Keep tests readable, isolated, and deterministic, with small fixtures and controlled time and randomness. Assert observable behavior, mock external boundaries, and fix flaky tests. Use coverage to find important gaps.
- Each agent includes relevant tests with its changes. Review test quality and integration; require lint, type checks, tests, and a production build in GitHub Actions before merging or deploying.
- Check pronunciation, playback, touch interactions, and layout on the actual iPhone at playable milestones and before releases.

## Roadmap

V0 is playable. The visual direction, natural voices, and playful quiz interactions are ready for this phase. The 441-card review library is available. Practice offers the six-word starter and three additional six-word themed sets, ready for feedback.

1. **Expand practice** ([#46](https://github.com/ajhconway/kikimashta/issues/46)). Bring a manageable selection from the library into lessons and quizzes. Start with small, coherent sets, use card feedback to improve them, and keep source levels provisional.
2. **Add adaptive review** ([#47](https://github.com/ajhconway/kikimashta/issues/47)). Revisit words when they need practice and gradually introduce new ones. Start with simple, adjustable learning rules; sessions can continue while practice items are available.
3. **Sync progress** ([#6](https://github.com/ajhconway/kikimashta/issues/6)). Add Supabase sign-in and cross-device sync, preserving existing history and including card feedback.
4. **Broaden the exercises** ([#48](https://github.com/ajhconway/kikimashta/issues/48)). Introduce phrases, sentences, and other quiz formats. Explore timing challenges, Japanese writing, and offline practice as separate additions. English text remains an option.

### Current milestone: expanded practice

Keep the existing starter round. Add a few six-word themed sets using existing pictures and Marin/Cedar recordings. Let the user choose a set, preview its words, and practice that same set in a short untimed quiz. Preserve stable item IDs and saved history. Avoid ambiguous or synonymous choices in these first sets; pictures and pronunciation still need feedback through use.

Keep only the next milestone detailed in GitHub. Later stages remain flexible, with no fixed dates. Keep *k*, word counts, session length, visual details, and the learning algorithm adjustable.
