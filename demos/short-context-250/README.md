# Short contextual question demo — #250

An isolated review demo for [Kikimashta issue #250](https://github.com/ajhconway/kikimashta/issues/250), built from the ten randomly sampled words and the short drafts in the owner conversation. This is separate from the production question bank and uses only tab-local answers.

[Open the private demo](https://kikimashta-short-context-250.cornell-tech-5688.chatgpt.site).

The buildless `dist/` directory is the complete site. It contains the authored content, SVG illustrations, player, and generated MP3 clips. No service credentials, backend, or learning-progress storage are used.

The presentation follows production `src/styles.css`, `src/themes.ts`, `ContextualQuiz`, and `QuizChrome`: mint contextual background (#b8dfcd), correct/incorrect screen colors (#e9b6ff / #b8a4cf), rounded system typography, 380px practice column, white cards with 6px purple outlines, pink circular speaker control, progress beads, and the existing Kiku cat/icon assets. Illustrations use brighter fills and purple outlines to echo the current picture bank. The demo remains untimed and keeps manual navigation for content review.

## Local checks

- `npm run check` — JavaScript syntax checks.
- `npm test` — first-answer behavior, summary, bank validation, and exact illustrated counts.
- `npm start` — serve `dist/` at http://127.0.0.1:5310.
- `npx playwright test` — Chromium desktop and WebKit phone-size journeys, actual MP3 playback, failure fallback, session navigation, and keyboard access. Install dev dependencies with `npm ci` first; installed browsers are required.

## Audio

`python3 generate-audio.py` regenerates the ten MP3s on macOS with the installed Kyoko Japanese voice and ffmpeg. Kana fixes target readings. There is a 650 ms pause between sentence and question, where present. Audio is normalized to -22 LUFS. `audio-provenance.json` records the spoken text and durations. This is prototype speech, not a new production voice selection.

## Content review

Answer cards intentionally omit written labels until feedback. English screen-reader labels describe the illustrations. Quantities use the same object across all four choices; spatial cards use consistent cat and box art. The target for 上 retains the inverse spatial question. 大した remains the owner's draft negative injury example and has an explicit review note in the transcript.

Check pronunciation, touch interaction, and the injury/effort illustrations on the real iPhone before treating the demo as accepted content. Automated browser checks supplement that review.
