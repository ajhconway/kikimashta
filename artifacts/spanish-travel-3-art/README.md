# Spanish Travel level 3 media review (#174)

31 selected new transparent illustrations, five unchanged approved reuses and 288 recordings in eight regional voices. The word list and generation were approved; owner media acceptance is pending.

- [Combined pictures and voices](review.html)
- [All 36 pictures at 145px](artwork.html)
- [Exact image prompts](requests.json)
- [Owner feedback, selected revisions and preserved originals](revisions/history.json)
- [Exact revision prompts](revisions/)
- [Picture provenance and decoded alpha measurements](manifest.json)
- [Audio provenance](../spanish-travel-3-audio-review/manifest.json)

Every generated original is preserved without resizing or flattening under `originals/`. Each generation record binds the image to the exact prompt and style-reference hash. The apple, banana, mountain and river JPGs and forest PNG are copied unchanged under `reused/`. Their source paths/hashes and approval evidence remain in the manifest.

The toilet-paper tail is now straight (v3), the blanket is broad bedding without fringe (v2), and the crossing connects opposite sidewalks (v2). The approved standalone banana replaces the redundant new image. All 32 first generations and four edited variants remain unchanged in `originals/`; the history records the selected hashes.

All recordings use the standard constant-gain profile. Two are flagged as slightly quieter within processing limits: Santiago / taco and Carlos Figueroa / isla. All 288 decode and play in Chromium and mobile WebKit; this is browser emulation, not real-iPhone or owner pronunciation acceptance.

Rebuild and validate the review:

```sh
node scripts/content/build-spanish-travel-level-3-media-review.mjs
python3 -m http.server 5183 --bind 127.0.0.1 --directory .
```

Open <http://localhost:5183/artifacts/spanish-travel-3-art/review.html>. Search, regional/voice filters and sequential playback are available. No active app bank or pack is changed by this review.
