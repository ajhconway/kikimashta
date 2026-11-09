# Travel level 4 artwork (#207)

[Pictures and all eight voices](review.html) · [All pictures at 145px](artwork.html) · [Exact prompt set](requests.json).

All 35 new illustrations are generated, with one unchanged approved flower completing the 36-picture pack. The owner requested finishing every picture before giving feedback on the complete pack, replacing the initial pauses between artwork batches. The gallery now presents all 36 pictures and 288 recordings for one full-pack review. Picture/listening acceptance and pack activation remain subsequent steps.

Original transparent square PNGs are preserved in `originals/`, with output hashes and exact prompt/reference hashes in `records/`. They are generated with the built-in image_gen tool, using the approved museum illustration as a style-only reference. Every selected generated PNG must have a square canvas of at least 1024px with both transparent and opaque pixels; original bytes are not resized or flattened.

The approved flower is reused unchanged. `selection.json` supports versioned revisions without overwriting originals; `manifest.json` verifies the selected pictures, current progress and source hashes. The immutable draft, original generation authorization, audio approvals and exact prompts retain their approved bytes; the later review-workflow amendment is recorded separately.

All 288 word recordings are ready and hash-verified before the combined gallery is written. Native playback/clock checks passed for every clip in Chromium and mobile WebKit. One clip remains slightly quieter within processing limits: Carlos Figueroa / azúcar. See the audio review and verification records for details.
