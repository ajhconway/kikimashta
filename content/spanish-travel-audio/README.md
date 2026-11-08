# Spanish travel audio (#155)

The owner selected the four proposed regional pairs and authorized all 36 approved words: Juan/Pamela (Mexico City), Albeiro/Carito (Bogotá), Santiago/Agustina (Buenos Aires) and Carlos Figueroa/Veronica (Puerto Rico). Cesar and the two audition alternatives are excluded from this batch. The existing six-word starter and its historical audio are retained until a separate pack activation.

All 288 recordings are generated using `eleven_v4`, stability 0.5, similarity boost 0.75, language code `es`, and MP3 44.1kHz/128kbps. The exact word/voice approval is hash-bound in `approval.json`; the registry is `content/es-419-voices.json`. Input length is 1,824 Unicode characters; it is not a price estimate.

`artifacts/spanish-travel-audio-review/index.html` provides the complete listening review with word, region and voice filters, native audio controls and sequential playback. Its manifest preserves exact requests, provider voice/request IDs, source and delivery hashes, voice/region metadata, durations and levels. `generated-media.json` summarizes the complete matrix and four quieter clips.

Provider originals and complete processing/account records remain private in the ignored generation artifact and the hash-verified durable archive `~/.local/share/kikimashta/spanish-audio/155-v1`. Review audio contains constant-gain MP3 deliveries, not provider originals. All 288 deliveries were fully decoded and remeasured while processing. The established profile targets -22 LUFS and a -2 dBTP ceiling with at most 9dB boost. Four clips stay slightly quieter: Santiago's carro, taxi and hospital; Juan's taxi. The review marks them explicitly.

This batch is ready for listening review. Generation and technical checks do not establish pronunciation acceptance or activate the expanded practice pack. The owner deferred real-iPhone checks to deployment.

Commands and resume safeguards are documented in `docs/ELEVENLABS.md`.

## Accepted activation (#159)

The owner approved the complete review and requested activation. `acceptance.json` binds that approval to the exact artwork/audio review manifests, including the four quieter clips. `activation.json` maps all 36 pictures and 288 recordings to verified production paths. The active bank is `content/es-419.json`; previous Cesar media and provenance remain intact. Existing hotel/water/coffee/car IDs are unchanged, while entrance/exit leave active selection without deleting their history.

`npm run content:spanish:activate` preflights the full accepted matrix, picture approval and source hashes, checks production target containment, preserves PNG transparency, and stages the accepted normalized MP3s. It generates no speech. Car and taxi are mutually excluded as picture distractors. Spanish library voices display regional descriptions and have an independent saved selection; Japanese preferences retain their existing key.
