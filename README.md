# Kikimashta

A relaxed listening game that starts with Japanese. Hear a word, choose its picture, and build recognition through short practice sessions.

Adaptive sessions start with a fixed block of due reviews, followed by new-word lessons in chunks of roughly ten. Each chunk introduces pictures and audio, then mini-quizzes those words. A qualitative review-density range guides new-word intake. The home screen shows minimum and maximum selector wheels around the current density. Each intensity has its own Kiku expression, permanent color and label, bundled together inside the choice before and after selection. Minimal is asleep, Light uses the standard Kiku, Moderate and High keep their cheerful poses, and Intense looks seriously concentrated. Artwork and generation prompts are recorded in [the intensity artwork provenance](content/kiku-pace-provenance-v2.json). All five choices remain in each wheel; unavailable choices have dimmed artwork and labels and cannot be selected. An unavailable landing returns with a brief, interruptible spring; reduced motion skips it. Sessions remain untimed, and progress saves on the device first. Japanese is the first language bank; words, media, and learning history are kept separate so other languages can follow.

Quizzes use flat picture cards with an expressive squash on press and Kiku's slow, gentle sway. Progress dots count words answered correctly; small pink crosses below them count mistakes. Missed words shuffle back into the remaining questions until each is answered correctly, with another word in between whenever possible. Every attempt is saved; corrective retries link to the original miss and are excluded from FSRS retention evidence.

Cards slide into place. Correct answers receive a warm glow, Kiku sparkles and a firework of stars centered on the card grid. The correct card stays in place while the other cards accelerate straight outward from the grid's center. After a miss, the two uninvolved pictures slump and fall away, leaving the chosen and correct pictures visible against a muted background. Grid spacing stays fixed. Correct answers move on after a 1.2-second beat, once playback and saving finish. Replay holds that transition while the word plays again; misses wait for Continue. Leaving the page pauses playback and automatic transitions. Motion follows the device’s reduced-motion preference. Quiz cards suppress image callouts and selection during a hold while retaining native button activation.

- [Project plan](PLAN.md)
- [Agent working agreements](AGENTS.md)
- [Optional account sync setup](docs/SUPABASE.md)

The home screen's **Dev review** button opens a six-word random review for testing, even when nothing is due. It uses the usual quiz and corrective retries, without saving answers or changing learning progress. Finish returns to normal adaptive practice.

Work is tracked in GitHub Issues and implemented through linked pull requests. Initial app setup, shared data types, and automated checks come before parallel feature work.

## Development

Use Node 24.15 or newer, Python 3.10 or newer, and FFmpeg for the audio-processing checks.

```sh
npm ci
npm run dev
```

`npm run check` runs lint, type checks, unit/UI tests, and the production build. After building, run `npx playwright install chromium webkit` and `npm run test:e2e` for browser journeys. GitHub Actions tests the `/` deployment path used by `kikimashta.com` before publishing.

Local Playwright tests mute only the media elements in their test pages, before calling the real browser `play()` method. System audio and other apps are untouched. Recordings still download, decode, advance, end, replay, and report failures normally. Use `E2E_AUDIO=audible npm run test:e2e` for unchanged local playback, or `E2E_AUDIO=quiet npm run test:e2e` to explicitly request silence. This also applies to direct `npx playwright test` runs.

Muted media can have different autoplay permissions. CI therefore runs the existing journeys without this muting, retaining unmuted autoplay coverage; dedicated quiet-mode regressions also run there. Use the shared `e2e/fixtures.ts` test import for new browser specs. Browser tests supplement pronunciation and interaction checks on the actual iPhone. See [issue #95](https://github.com/ajhconway/kikimashta/issues/95).

Production uses GitHub Pages with `kikimashta.com` configured in the repository’s Pages settings. Domain routing is managed there; the Actions deployment does not use a repository `CNAME` file.

The starter bank is in `content/ja.json`. The adaptive pool uses its original six IDs plus eligible IDs in `content/practice-pool.json`, resolved from `content/catalog/ja.json`. Flagged cards and duplicate pictures, readings, meanings and visual groups are excluded from the initial pool; source levels remain provisional introduction order. The earlier fixed-set manifest remains available as a content reference. Media paths stay relative to the app. Named background colors live in `src/themes.ts`.

Scheduling uses pinned `ts-fsrs` 6.0.0 with the explicit FSRS-6 model, 90% desired retention, shared default parameters and correctness-based Good/Again grades. Original attempts remain unchanged; old fixed-round results surface each known word for review without inventing delayed-retention evidence. New attempts distinguish lesson mini-quizzes from later reviews and retain recording/replay context. Personal parameter fitting remains a later step once enough relevant history accumulates.

Density forecasts simulate seven days with 32 deterministic scenarios, one fixed review session per day, repeat reviews and sampled FSRS success/failure. New-word admission initially assumes an 80% mini-quiz success rate. These are adjustable forecast assumptions, not measured learning efficacy. Qualitative levels start at 0/5/15/30/60 reviews per day; preferred minimum uses a band's lower edge and maximum its upper edge (Intense admission ceiling: 120/day). Default Light–Moderate targets 5–30/day. Thresholds and assumptions live in `src/core/density.ts`; the UI shows labels, not these numbers. Newly due work waits for the next session, and actual future demand can exceed the admission forecast.

Existing cards use eight approved ElevenLabs voices: Otani, Morioki, Goro, Tsuki, Takeshi, Lime, Ritsuto, and Itsuki. The set balances male and female voices across standard Japanese, Kansai and Kyushu labels, plus character delivery. Each item has an array of recordings; practice chooses one when presenting the word and retains it for replay and retry. Progress remains tied to the language and word across voices. Gain adjustments aim for −22 LUFS with at least 2 dB of true-peak headroom; constrained clips remain quieter and are listed in provenance. Pronunciation, regional accents and playback of the new words still need listening review on the iPhone 17.

## Account sync

Sync is optional and needs the project configuration in [the setup guide](docs/SUPABASE.md). Email sign-in adds account controls for sync, sign-out, and copying this device’s guest progress. Answers and card notes save locally first; interrupted transfers retry on the next change, browser focus, connection recovery, or Sync now. Incoming history affects the next session without changing an active quiz. Dev review stays unsaved. Preferred pace remains a device setting.

The database migration and rollback access-policy checks live in `supabase/`. All 37 SQL checks also pass on the connected Supabase project, and its live Data API denies anonymous access. CI tests the real SDK against a simulated HTTP service and uses real browser storage for cross-device journeys. Resend SMTP and deployment variables are configured. Live signup and later sign-in, delivered code emails, and note edit/deletion sync pass in isolated Chromium browsers. The user confirmed both emails arrived. Production deployment and an actual iPhone check remain; see the setup guide's activation status.

## Voice auditions

The owner approved eight voices and their volume-matched audition in [issue #78](https://github.com/ajhconway/kikimashta/issues/78). The full card migration is tracked in [issue #86](https://github.com/ajhconway/kikimashta/issues/86). Follow [the ElevenLabs setup guide](docs/ELEVENLABS.md) for local account connection, generation, resume, normalization, and staging. `npm run audio:audition:elevenlabs -- --dry-run` previews a small audition; `npm run audio:cards:elevenlabs -- --dry-run` previews the whole existing card bank. The older hosted OpenAI workflow below is retained for historical comparisons.

### Existing OpenAI recordings

Audio quality work is tracked in [issue #10](https://github.com/ajhconway/kikimashta/issues/10). The [voice comparison](https://kikimashta.com/audio-review/) is available separately from the lesson bank.

The legacy OpenAI generator runs in GitHub Actions with an `OPENAI_API_KEY` repository secret under Settings → Secrets and variables → Actions. The **Generate audio** workflow runs when `content/audio-generation-request.json` changes on `main`, or through **Run workflow**. Its request modes remain `words`, `sentences`, `bank`, and `catalog`; bank mode records every starter item with Marin and Cedar. Unrelated pushes and pull requests do not generate paid audio. Use the ElevenLabs command for new card recordings.

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

The library combines original SVG scenes with 110 approved replacement illustrations from batches 01–08. Delivery hashes and source manifests are recorded in [active artwork provenance](content/card-regeneration/activation.json). Context-sensitive entries retain their review notes, and synonyms have picture groups that can inform future quiz choices. Search, level filters, and pagination support reviewing the collection; one shared audio player compares the eight named voices.

Each card has a collapsible **Your feedback** box that saves as you type in this browser. **Export feedback** downloads all nonempty notes with stable card IDs and Japanese/English labels, across every level and page, for sharing or backup. Guest notes stay local. When optional Supabase sync is configured, signed-in notes synchronize with the account; clearing a box syncs a deletion. Each account and guest practice use separate local storage. Copying guest history and notes into an account is an explicit action in Account. Existing account note edits take precedence over imported guest notes. If saving fails, the draft stays available while the page is open and can still be exported.

`npm run content:illustrate` regenerates illustrations and scene metadata. `npm run content:library` validates media and builds the static library. The explicit `--allow-missing-audio` option is for previews only: absent recordings are visibly disabled. Hosted catalog audio runs by source level with two jobs in parallel, retaining original WAVs and partial results. Verified MP3s are staged to a review branch for integration, never deployed automatically.

## License and media

Copyright (c) 2026 Alex Conway. The project's own code and documentation are licensed under [GNU AGPLv3 only](LICENSE) (`AGPL-3.0-only`), except where separate terms are identified. Commercial use is permitted subject to the license's conditions, including applicable source-sharing requirements. See [NOTICE](NOTICE) for scope and history.

The change takes effect on 2026-11-05. Versions through commit [`02dcb584`](https://github.com/ajhconway/kikimashta/commit/02dcb58400f4971c6e54e2f7740b4d1c3328d25f) were released under MIT; their existing MIT permissions remain. New contributions to the project's code are offered under AGPLv3 only unless explicitly agreed otherwise.

The app's **Code & credits** link provides the license, dependency notices, and source code. Production builds include these notices and link to their exact source revision. GitHub Pages supplies `SOURCE_REVISION` from the checked-out commit. Local builds without it and the development server link to the repository; `npm run dev` prepares the local notice downloads automatically.

Media and dependencies retain separate terms. Current practice speech is AI-generated with ElevenLabs; historical OpenAI recordings are preserved with their provenance. Earlier Open JTalk clips retain their CC BY 3.0 HTS voice attribution; see [media credits](public/credits.html) and the records in `content/`. The cat mascot and icon are adapted from artwork supplied by the project owner; edit records are in `content/brand-provenance.json`. The six original starter SVGs remain under [MIT](LICENSES/MIT.txt), as recorded in `content/vector-provenance.json`; new catalog SVGs are AGPLv3 only, as recorded in `content/catalog/image-provenance.json`. Earlier watercolor assets and their prompts remain in the repository; full PNG originals are retained locally outside the deployment directory.

## Card regeneration

[Approved artwork and prompt workflow](content/card-regeneration/README.md) tracks issue #72. Batches 01–08 contain 110 approved selected cards, with original variants and feedback preserved. The selected illustrations are active in practice; [activation provenance](content/card-regeneration/activation.json) records their delivery hashes.

To activate reviewed batches on macOS: `node scripts/content/activate-approved-artwork.mjs batch-08`, then `npm run content:library`. Approval and source hashes are checked before image mappings change.

Transparent approved sources export as alpha-preserving 640px PNGs. Earlier opaque deliveries retain their existing JPEG files and provenance. The activation command validates decoded transparency and opaque white subject details before atomically replacing a delivery.
