# ElevenLabs voice generation

Start with a small Japanese audition, then choose voices before regenerating the library. Track this first step in [issue #78](https://github.com/ajhconway/kikimashta/issues/78). The app will continue playing static MP3 files. Generation runs locally; the browser never calls ElevenLabs.

## Account and voice setup

1. [Create an ElevenLabs account](https://elevenlabs.io/) and choose **ElevenCreative** for its Text to Speech and voice browsing tools. ElevenAgents is for conversational agents. The seven-sample audition is small; use your account's available credits to compare voices before choosing a larger plan. See [API pricing](https://elevenlabs.io/pricing/api) for current allowances and usage terms.
2. Browse the Voice Library for Japanese voices and add one or two candidates to your voice collection. Favor natural standard Japanese, clear word endings, and a relaxed conversational delivery. Listen to Japanese samples: a voice's English demo does not establish its Japanese pronunciation. ElevenLabs recommends [matching the voice to the target region](https://elevenlabs.io/docs/overview/capabilities/voices).
3. Copy each candidate's **voice ID** from the voice's menu/details. The generator accepts IDs, rather than display names. These IDs can be shared in chat when choosing voices.
4. In [Developers → API Keys](https://elevenlabs.io/app/developers/api-keys), create a key for this project's generation script. Enable the Text to Speech permission and set a small credit quota. This command only uses the text-to-speech endpoint; it does not list, create, or clone voices. ElevenLabs documents [key scopes and quotas](https://elevenlabs.io/docs/api-reference/authentication).
5. Add the values below to `.env.local` in the repository root. Preserve any existing settings in that file. It is already ignored by Git. Keep the key out of chat and do not prefix it with `VITE_`.

```dotenv
ELEVENLABS_API_KEY=your-private-key
ELEVENLABS_VOICE_IDS=first-voice-id,second-voice-id
```

Use one voice ID to start if you prefer. At most three voices are allowed per audition.

## Preview and generate

Use Node 24.15 or newer. Run `npm ci` for project dependencies. The new command uses Node's built-in HTTP client and saves provider-original MP3s; it does not need an ElevenLabs SDK or FFmpeg.

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

The baseline is `eleven_multilingual_v2`, which supports Japanese. This is a starting point for comparison, not a final quality decision. You can compare another model with the same voices and texts:

```sh
npm run audio:audition:elevenlabs -- --model eleven_v3 --dry-run
npm run audio:audition:elevenlabs -- --model eleven_v3
```

The request uses stability `0.5` and similarity boost `0.75`. Only Japanese sample text goes in `text`: English directions would be spoken too. Multilingual v2 detects the language; for other models the script sends `language_code: ja`. See the [speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) for supported models and settings. The audition preserves provider levels; review volume before production processing.

## Listening review and migration

Compare samples at the same volume. Listen for pronunciation, pitch accent, unwanted extra sounds, clipped endings, and natural sentence rhythm. Check the samples on the real iPhone before approving voices. Browser playback checks supplement that listening review.

After choosing voices, add hosted ElevenLabs generation with an `ELEVENLABS_API_KEY` Actions secret, regenerate a small vocabulary batch, and review it before the full bank. Replace audio manifests and the library's Marin/Cedar display assumptions together; retain stable language and item IDs so learning history carries across voices. Update media credits and provenance with the approved files. Existing OpenAI workflows are still OpenAI-only; adding an ElevenLabs secret alone does not switch them. No production audio is replaced by this command.
