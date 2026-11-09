# Spanish Travel level 2 media review (#166)

34 new transparent illustrations, 2 unchanged approved JPG reuses, and 288 recordings in eight regional voices. Awaiting owner media acceptance.

- [Combined picture and voice review](review.html)
- [All pictures at 145px](artwork.html)
- [Picture provenance and hashes](manifest.json)
- [Exact built-in image prompts](requests.json)
- [Audio provenance](../spanish-travel-2-audio-review/manifest.json)

Original generated PNGs are preserved without flattening or resizing under `originals/`. Generation records bind each original to the exact prompt and style-reference hash. Approved plate and drinking-glass JPGs are copied unchanged under `reused/`; their source paths and approval evidence are in the manifest. No images are activated by this review.

Rebuild and validate all picture and review-audio hashes with:

```sh
node scripts/content/build-spanish-travel-level-2-media-review.mjs
```

Serve `artifacts/` from the repository to keep sibling audio links available:

```sh
python3 -m http.server 5180 --bind 127.0.0.1 --directory artifacts
```

Open <http://localhost:5180/spanish-travel-2-art/review.html>. Native controls, word search, regional/voice filters and sequential playback are available. The artwork-only gallery shows images at the 145px practice-card size. Final pronunciation and artwork acceptance belongs to the owner.
