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

The word bank is in `content/ja.json`. Keep media paths relative to the app. Picture count and session length are parameters in `src/core/session.ts`. Response timing starts when a question is presented; no deadline is imposed.

The initial Open JTalk voice is provisional. Voice preference and Japanese pronunciation still need human review, alongside audio playback and touch behavior on the iPhone 17.

The code is licensed under [MIT](LICENSE). Speech uses the attributed CC BY 3.0 HTS voice; see [media credits](public/credits.html) and the records in `content/`. Generated image prompts are in `content/image-provenance.json`. Optimized delivery images are included; full PNG originals are retained locally outside the deployment directory.
