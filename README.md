# Kikimashta

A relaxed listening game that starts with Japanese. Hear a word, choose its picture, and build recognition through short practice sessions.

Practice offers a six-word starter round and three additional themed sets, with picture-and-audio previews, untimed quizzes, and progress saved on the device. Japanese is the first language bank; words, media, and learning history are kept separate so other languages can follow.

Quizzes use flat picture cards with an expressive squash on press, Kiku the listening cat, and larger progress dots at the bottom. Cards slide into place. Correct answers receive a warm glow, Kiku sparkles and a small firework of stars while the other cards give an excited shake and fly away. After a miss, the two uninvolved pictures slump and fall away, leaving the chosen and correct pictures visible against a muted background. Grid spacing stays fixed. Answer messages keep only their main text. Correct answers move on after a 1.2-second beat, once playback and saving finish. Replay holds that transition while the word plays again; misses wait for Continue. Leaving the page pauses playback and automatic transitions. Motion follows the device’s reduced-motion preference. Quiz cards suppress image callouts and selection during a hold while retaining native button activation.

- [Project plan](PLAN.md)
- [Agent working agreements](AGENTS.md)

Work is tracked in GitHub Issues and implemented through linked pull requests. Initial app setup, shared data types, and automated checks come before parallel feature work.

## Development

Use Node 24.15 or newer.

```sh
npm ci
npm run dev
```

`npm run check` runs lint, type checks, unit/UI tests, and the production build. After building, run `npx playwright install chromium webkit` and `npm run test:e2e` for browser journeys. GitHub Actions tests the `/` deployment path used by `kikimashta.com` before publishing.

Production uses GitHub Pages with `kikimashta.com` configured in the repository’s Pages settings. Domain routing is managed there; the Actions deployment does not use a repository `CNAME` file.

The starter bank is in `content/ja.json`. Additional six-word sets are listed in `content/practice-sets.json`, referencing stable IDs from `content/catalog/ja.json`; `src/core/practice.ts` resolves them into playable banks. Source levels remain provisional. Keep media paths relative to the app. Picture count and session length are parameters in `src/core/session.ts`. Response timing starts when a question is presented; no deadline is imposed. Named background colors live in `src/themes.ts`; give future quiz types their own theme.

Starter words use OpenAI Marin and Cedar, selected through word and sentence auditions. Each item has an array of recordings; practice chooses one when presenting the word and retains it for replay and retry. The same format supports a single voice or a human recording. Progress remains tied to the language and word, across voices. Pronunciation and playback still need review on the iPhone 17.

## Voice auditions

Audio quality work is tracked in [issue #10](https://github.com/ajhconway/kikimashta/issues/10). The [voice comparison](https://kikimashta.com/audio-review/) is available separately from the lesson bank.

Generation normally runs in GitHub Actions. Configure an `OPENAI_API_KEY` repository secret once under Settings → Secrets and variables → Actions. The **Generate audio** workflow runs when `content/audio-generation-request.json` changes on `main`, or through **Run workflow**. To request another run, change the request's `id` and choose `mode`: `words`, `sentences`, or `bank`. Bank mode reads the Japanese word bank and records every item with both Marin and Cedar. Unrelated pushes and pull requests do not generate paid audio.

The agent can submit a request, collect the resulting artifact, review the audio and provenance, then publish approved audition clips through a PR. Generation does not publish files automatically. Original WAVs and listening MP3s are retained in the workflow artifact for 30 days; download and preserve originals before expiry.

For local generation instead:

```sh
npm run audio:audition -- --dry-run
# Add OPENAI_API_KEY=your-key to the ignored .env.local file, then:
npm run audio:audition
# Four full sentences each for Marin and Cedar:
npm run audio:audition -- --sentences
# Both selected voices for every word in the starter bank:
npm run audio:audition -- --bank
```

Generation requires FFmpeg and an OpenAI API account with billing and access to `gpt-realtime-2.1-mini`. Each run makes nine paid requests for word auditions, eight for sentence auditions, or two per bank item (currently twelve), without automatic retries. The key is available only to the generation tool; never prefix it with `VITE_`, put it in browser code, or commit it.

Local runs preserve the provider-original WAVs, listening MP3s, and provenance under `artifacts/generated-originals/audio-audition/`. Word auditions include an `index.html`; sentence clips are added to the shared comparison after review. Choose a voice and review pronunciation, pitch accent, volume, and word endings before publishing replacement audio.

The generator follows the current [OpenAI Realtime audio guide](https://developers.openai.com/api/docs/guides/realtime-conversations); the supported voices and model can be revisited as providers change. The test suite uses a fake transport and makes no API calls.

## Vocabulary library

The review library at `/vocabulary/` contains 441 entries transcribed from the owner's level 1–5 screenshots. Levels are provisional source labels, separate from stable word IDs. The original transcriptions and screenshot hashes are in `content/imports/`; the flat catalog is in `content/catalog/ja.json`.

Original SVG scenes and symbols match the starter style. Context-sensitive entries carry review notes, and synonyms have picture groups that can inform future quiz choices. Search, level filters, and pagination support reviewing the large collection; one shared audio player compares Marin and Cedar.

Each card has a collapsible **Your feedback** box that saves as you type in this browser. **Export feedback** downloads all nonempty notes with stable card IDs and Japanese/English labels, across every level and page, for sharing or backup. Notes are local to the browser; sign-in and synchronization can follow later. Clearing a box removes its saved note. If saving fails, the draft stays available while the page is open and can still be exported.

`npm run content:illustrate` regenerates illustrations and scene metadata. `npm run content:library` validates media and builds the static library. The explicit `--allow-missing-audio` option is for previews only: absent recordings are visibly disabled. Hosted catalog audio runs by source level with two jobs in parallel, retaining original WAVs and partial results. Verified MP3s are staged to a review branch for integration, never deployed automatically.

## License and media

Copyright (c) 2026 Alex Conway. The project's own code and documentation are licensed under [GNU AGPLv3 only](LICENSE) (`AGPL-3.0-only`), except where separate terms are identified. Commercial use is permitted subject to the license's conditions, including applicable source-sharing requirements. See [NOTICE](NOTICE) for scope and history.

The change takes effect on 2026-11-05. Versions through commit [`02dcb584`](https://github.com/ajhconway/kikimashta/commit/02dcb58400f4971c6e54e2f7740b4d1c3328d25f) were released under MIT; their existing MIT permissions remain. New contributions to the project's code are offered under AGPLv3 only unless explicitly agreed otherwise.

The app's **Code & credits** link provides the license, dependency notices, and source code. Production builds include these notices and link to their exact source revision. GitHub Pages supplies `SOURCE_REVISION` from the checked-out commit. Local builds without it and the development server link to the repository; `npm run dev` prepares the local notice downloads automatically.

Media and dependencies retain separate terms. Current practice speech is AI-generated with OpenAI. Earlier Open JTalk clips retain their CC BY 3.0 HTS voice attribution; see [media credits](public/credits.html) and the records in `content/`. The cat mascot and icon are adapted from artwork supplied by the project owner; edit records are in `content/brand-provenance.json`. The six original starter SVGs remain under [MIT](LICENSES/MIT.txt), as recorded in `content/vector-provenance.json`; new catalog SVGs are AGPLv3 only, as recorded in `content/catalog/image-provenance.json`. Earlier watercolor assets and their prompts remain in the repository; full PNG originals are retained locally outside the deployment directory.
