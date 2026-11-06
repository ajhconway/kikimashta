# ElevenLabs voice generation

The project owner approved eight Japanese voices and their volume-matched audition in [issue #78](https://github.com/ajhconway/kikimashta/issues/78). The existing-card migration is tracked in [issue #86](https://github.com/ajhconway/kikimashta/issues/86). The app plays pregenerated static MP3 files. Generation runs locally; the browser never calls ElevenLabs.

## Account and voice setup

1. [Create an ElevenLabs account](https://elevenlabs.io/) and choose **ElevenCreative** for its Text to Speech and voice browsing tools. ElevenAgents is for conversational agents. The seven-sample audition is small; use your account's available credits to compare voices before choosing a larger plan. See [API pricing](https://elevenlabs.io/pricing/api) for current allowances and usage terms.
2. Browse the Voice Library for Japanese voices and add one or two candidates to your voice collection. Favor natural standard Japanese, clear word endings, and a relaxed conversational delivery. Listen to Japanese samples: a voice's English demo does not establish its Japanese pronunciation. ElevenLabs recommends [matching the voice to the target region](https://elevenlabs.io/docs/overview/capabilities/voices).
3. Copy each candidate's **voice ID** from the voice's menu/details. The generator accepts IDs, rather than display names. These IDs can be shared in chat when choosing voices.
4. Run `npx -y @elevenlabs/cli@latest onboard init` from the repository root and follow its browser authorization flow. It saves a project key directly in the ignored `.env.local` file. This project's account connection is configured locally; keys are never committed. To verify the key and SDK integration without generating speech, run `npx -y @elevenlabs/cli@latest onboard check --answered --env-path .env.local`.
5. Set `ELEVENLABS_VOICE_IDS` in `.env.local` with the chosen IDs. Preserve existing settings and the key created by onboarding. Keep the key out of chat and do not prefix it with `VITE_`. ElevenLabs documents [key scopes and quotas](https://elevenlabs.io/docs/api-reference/authentication) if you want to adjust the generation key's access or credit limit.

```dotenv
# ELEVENLABS_API_KEY is saved here by onboarding; leave it in place.
ELEVENLABS_VOICE_IDS=first-voice-id,second-voice-id
```

Use one voice ID to start if you prefer. At most three voices are allowed per audition.

## Preview and generate

Use Node 24.15 or newer. Run `npm ci` for project dependencies, including the pinned official `@elevenlabs/elevenlabs-js` SDK. The npm audition command loads `.env.local` into the Node process using `--env-file-if-exists`; only this local generator uses the key. It saves provider-original MP3s and does not need FFmpeg.

```sh
# No API calls or file changes; works before account setup.
npm run audio:audition:elevenlabs -- --dry-run

# With voice IDs configured, check total requests and input character count.
npm run audio:audition:elevenlabs -- --voice FIRST_ID --voice SECOND_ID --dry-run

# Uses the key and voice IDs from .env.local. This consumes ElevenLabs credits.
npm run audio:audition:elevenlabs
```

Each voice gets three words (ねこ, りんご, コップ) and four sentences, matching the existing OpenAI comparison texts. One voice makes seven requests; two make fourteen. The dry run reports input character counts, not a billing estimate; model and voice pricing can differ. Calls run sequentially without automatic retries. A failed request stops the run, retains earlier clips, and exits with an error. Each run requires a new output directory to prevent overwriting an audition.

Output is saved under the ignored `artifacts/generated-originals/elevenlabs-audition/<timestamp>/` directory:

- `index.html`: open directly in a browser to compare the clips.
- `<voice-id>-<sample-id>.mp3`: the unmodified MP3 bytes received from ElevenLabs.
- `provenance.json`: voice IDs, model, exact request text and settings, timestamps, request IDs when available, hashes, and failures. It contains no API key.

The initial model is `eleven_v4`, following ElevenLabs' current Text to Speech skill. It supports Japanese. This is a starting point for comparison, not a final quality decision. You can compare another model with the same voices and texts:

```sh
npm run audio:audition:elevenlabs -- --model eleven_multilingual_v2 --dry-run
npm run audio:audition:elevenlabs -- --model eleven_multilingual_v2
```

The request uses stability `0.5` and similarity boost `0.75`. Only Japanese sample text goes in `text`: English directions would be spoken too. Multilingual v2 detects the language; for other models the script sends `language_code: ja`. SDK requests have a 45-second timeout and `maxRetries: 0`. The saved provenance records the REST field names, including the exact text and settings sent through the SDK. See the [speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) for supported models and settings. The audition preserves provider levels; review volume before production processing.

## Existing cards: generation, resume, and volume matching

The approved registry is `content/elevenlabs-voices.json`: Otani, Morioki, Goro, Tsuki, Takeshi, Lime, Ritsuto, and Itsuki. Generation covers the union of catalog and starter IDs, with the starter reading taking precedence for an overlapping ID. The initial batch contains 445 distinct IDs, 3,560 recordings, and 11,552 input characters. Shared IDs retain the same learning history; pronunciation aliases in different card IDs remain separate recordings.

```sh
npm run audio:cards:elevenlabs -- --dry-run
# Consumes credits. Reuse this directory to resume verified completed recordings.
npm run audio:cards:elevenlabs -- --output artifacts/generated-originals/elevenlabs-cards/2026-11-06-v1
```

The command uses at most three concurrent requests, no SDK retries, a conservative 13,900-credit projected budget and account balance checks every 100 completed recordings. It reserves the pending character cost at the published approximate one-credit-per-character rate and stops when a measured balance check no longer covers the remaining work. This is local monitoring, not an account spending-limit setting. `plan.json` locks the item text and voice settings; changed inputs require a new batch directory. Per-record sidecars and SHA-256 hashes let a clean resume skip verified paid results. The `originals.jsonl` journal is rebuilt from those sidecars if its append was interrupted. A pending request without a completed sidecar blocks resume: inspect provider history before deciding whether to recover or retry it. Never blindly delete pending requests or rerun a failed paid batch into a fresh directory.

Provider MP3s remain in `originals/<voice>/<item-id>.mp3`. Original hashes, exact request text/settings, model and request IDs are recorded alongside them. The generation artifact also retains before/after credit snapshots. None of those records contain the API key.

Install FFmpeg with `loudnorm` and `libmp3lame` support, then normalize locally:

```sh
python3 scripts/content/normalize-elevenlabs.py \
  --input artifacts/generated-originals/elevenlabs-cards/2026-11-06-v1 \
  --output artifacts/generated-originals/elevenlabs-cards/2026-11-06-v1-normalized
```

Use `--ffmpeg /absolute/path/to/ffmpeg` for a nonstandard installation. This command consumes no credits. It supports incremental snapshots and resume while the original batch grows. The profile targets −22 LUFS with dual-mono compensation, a −2 dBTP ceiling, and at most 9 dB of boost. It applies constant gain and re-encodes delivery MP3s directly from the provider originals. Encoded output is remeasured and fully decoded; frame counts must match the original. Gain search handles short-utterance meter steps. Clips that cannot reach the target safely remain quieter and receive `targetLimited` reasons; no compression, speech trimming, pitch or timing changes are applied. Clips shorter than 500 ms receive analysis-only padding, which is absent from the delivered audio.

After all recordings pass processing checks, stage the complete set together:

```sh
node scripts/content/stage-elevenlabs-cards.mjs \
  --input artifacts/generated-originals/elevenlabs-cards/2026-11-06-v1 \
  --delivery artifacts/generated-originals/elevenlabs-cards/2026-11-06-v1-normalized
npm run content:library
npm run check
```

Staging preflights the entire batch's card/voice identity, hashes, measured levels and durations before copying delivery audio to `public/audio/elevenlabs-v1/`. It replaces only the banks' audio arrays. Per-voice provenance is saved in `content/audio/elevenlabs/`; `content/elevenlabs-audio-provenance.json` lists the full profile and any constrained clips. The vocabulary library displays all eight names and uses the same playback behavior as before. Old recordings and their provenance are retained for reference.

`npm run test:audio` runs the Python processing tests; set `FFMPEG=/absolute/path/to/ffmpeg` for a nonstandard test installation. CI installs FFmpeg and runs these checks together with the application checks and browser journeys.

## Listening review

Compare samples at the same volume. Listen for pronunciation, pitch accent, unwanted extra sounds, clipped endings, and natural sentence rhythm. Check the samples on the real iPhone before approving voices. Browser playback checks supplement that listening review.

Voice and profile approval does not establish that every newly generated word has the right pitch accent or regional realization. Use the card library to review the complete set on the real iPhone before release. Hosted ElevenLabs generation can follow later; existing OpenAI workflows remain OpenAI-only, so use the local card command for this migration. The audition command itself never replaces production audio.
