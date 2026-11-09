# Learning languages (#143, #159, #166)

Menus remain in English. The home selector changes the learning language, available packs, approved practice pool, history, forecast and writing presentation. Selection, pack choices and voice choices are device preferences. Account history and notes already use language/item identity and require no schema change.

`src/core/languages.ts` registers each language's pool, packs, font policy and library route. Keep IDs stable: Japanese is `ja-JP`; Latin American Spanish is `es-419`. Recording locale can be more specific without changing learning identity. Japanese keeps its original pack/voice preference keys. Other languages use separate keys. Empty saved pack selection stays empty; voice selection keeps at least one voice. Switching is available at home and waits for pending or failed answers to be resolved.

## Spanish travel level 1

The approved picture pack contains 36 words in `content/es-419.json`, with all eight selected voices per word: Juan/Pamela (Mexico City), Albeiro/Carito (Bogotá), Santiago/Agustina (Buenos Aires), Carlos Figueroa/Veronica (Puerto Rico). Voice descriptions preserve the creators' regional labels. The library's Practice voices controls apply only to the selected learning language, so a Mexico City pair can be selected independently of Japanese voices. All eight recordings remain available for library audition.

The retained hotel/agua/café/carro items and the `es-419-travel-1-pictures` pack keep their stable IDs, preserving mastery and saved choices. Entrance/exit are retired from active selection; their attempts and historical Cesar recordings remain preserved. Spanish vocabulary is picture-only. Writing is deferred until contextual exercises; historical writing attempts are retained. Levels are practical content groupings, not proficiency certification.

Thirty new approved illustrations retain PNG transparency, and six pictures reuse existing approved assets including the umbrella. Car and taxi never appear as competing picture choices. `content/spanish-travel-audio/acceptance.json` binds owner listening approval to the complete audio/artwork manifests; `activation.json` verifies all production picture and recording hashes. Public normalized audio lives in `audio/es-419-travel-v2/`. Provider originals and processing evidence have a durable private archive; see `docs/ELEVENLABS.md`.

The accepted constant-gain profile targets -22 LUFS and a -2 dBTP ceiling without dynamics compression, trimming or timing changes. Four recordings remain slightly quieter within the processing limits, as recorded and accepted in provenance. No new speech is generated during activation or browser practice.

Spanish uses system type including accents. The Card library link opens `vocabulary/?language=es-419&pack=es-419-travel-1-pictures`. The shared library renders both 36-word travel banks (72 words in total) with pagination, search, pictures, Spanish text, English meanings, eight regional playback buttons, mastery, notes and export. Spanish notes use `es-419`; the legacy Japanese `ja` namespace remains intact.

The owner approved the artwork and audio and requested activation. Actual iPhone audio permissions, touch/layout, picture practice and persistence tests will be performed on the deployed version; a local HTTPS tunnel remains deferred. Chromium/mobile WebKit journeys check Spanish lessons, eight-voice selection, saved-history isolation and retention of retired starter history using real browser storage.

## Spanish travel level 2

`content/es-419-travel-2.json` adds 36 approved words with the same eight regional voices, registered as `es-419-travel-2-pictures`. The language pool combines approved banks while each pack keeps separate membership. Saved level 1-only or empty selections stay unchanged; new devices can select both packs. Progress remains keyed by language/item/exercise, with no history migration. The library can browse either level or all 72 cards.

`content/spanish-travel-2/acceptance.json` binds the owner's approval to the exact picture/audio manifests, including stairs v5. `activation.json` records all production hashes. The level 2 staging script validates the entire accepted matrix before writing: `node scripts/content/stage-spanish-travel-level-2.mjs`. It copies 34 transparent PNGs and 288 normalized MP3s byte-for-byte, reuses the approved plate/glass JPGs, and preserves all level 1 media. Level 2 audio lives under `audio/es-419-travel-2/`. No quieter-volume exceptions are needed.

Cross-pack picture ambiguity is recorded separately in `content/spanish-picture-exclusions.json` and applied symmetrically to the combined runtime pool. This avoids cup/coffee, glass/water/juice, coin/money, shampoo/bottle, receipt/ticket and room/furniture conflicts without rewriting either content bank. Existing car/taxi exclusions remain.
