# Kikimashta

A relaxed listening game that starts with Japanese. Hear a word, choose its picture, and build recognition through short practice sessions.

The first version uses six words, picture-and-audio previews, untimed quizzes, and progress saved on the device. Japanese is the first language bank; words, media, and learning history are kept separate so other languages can follow.

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

The word bank is in `content/ja.json`. Keep media paths relative to the app. Picture count and session length are parameters in `src/core/session.ts`. Response timing starts when a question is presented; no deadline is imposed. Named background colors live in `src/themes.ts`; give future quiz types their own theme.

The initial Open JTalk voice is provisional. Voice preference and Japanese pronunciation still need human review, alongside audio playback and touch behavior on the iPhone 17.

## Voice auditions

Audio quality work is tracked in [issue #10](https://github.com/ajhconway/kikimashta/issues/10). To compare three OpenAI voices on the same three Japanese words:

```sh
npm run audio:audition -- --dry-run
# Add OPENAI_API_KEY=your-key to the ignored .env.local file, then:
npm run audio:audition
```

Generation requires FFmpeg and an OpenAI API account with billing and access to `gpt-realtime-2.1-mini`. The live command makes nine paid requests without automatic retries. The key is read only by the local generation tool; never prefix it with `VITE_`, put it in browser code, or commit it.

Open the generated `index.html` under `artifacts/generated-originals/audio-audition/` to compare. Each run preserves the provider-original WAVs, listening MP3s, and provenance locally. It leaves the lesson bank unchanged. Choose a voice and review pronunciation, pitch accent, volume, and word endings before publishing replacement audio.

The generator follows the current [OpenAI Realtime audio guide](https://developers.openai.com/api/docs/guides/realtime-conversations); the supported voices and model can be revisited as providers change. The test suite uses a fake transport and makes no API calls.

The code is licensed under [MIT](LICENSE). Speech uses the attributed CC BY 3.0 HTS voice; see [media credits](public/credits.html) and the records in `content/`. The cat mascot and icon are adapted from artwork supplied by the project owner; edit records are in `content/brand-provenance.json`. Current vocabulary pictures are original SVG illustrations; creation records are in `content/vector-provenance.json`. Earlier watercolor assets and their prompts remain in the repository; full PNG originals are retained locally outside the deployment directory.
