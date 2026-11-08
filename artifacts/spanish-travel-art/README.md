# Spanish travel artwork review (#150)

The complete 36-word set is shown in `review.html` and `contact-sheet.html`. The selected set has 30 new transparent PNGs and six unchanged previously approved JPGs. Entrance and exit remain excluded.

The owner approved the other 34 pictures, asked about the existing umbrella, and rejected the passport's projecting page. `owner-feedback.json` binds approval to those exact original hashes. The gallery now reuses the already approved Japanese umbrella and shows a closed-booklet passport revision. Only the revised passport awaits artwork approval.

All 32 generated variants remain preserved: 31 original requests and one passport edit. The original passport is rejected; the newly generated umbrella is superseded by an existing approved picture. `manifest.json` contains the current selection, variant history, prompts, reference/input hashes, original source paths, output hashes and PNG pixel inspections. Batch manifests retain the generation history and approval states. No original was overwritten or removed.

Run a static server from this directory to view the HTML. `contact-sheet.png` shows the current selection. Detailed review includes four 145px background previews per item and a selectable large-preview background.

Generic car and taxi overlap semantically; review their distractor pairing before activating practice (#79). Artwork approval does not activate vocabulary or approve audio.

## Verification

- Card preparation tests: 22 passed; `scripts/cards/validate.py` passed.
- All 32 generated PNG variants match their original source bytes and SHA-256 records and pass the existing pixel decoder with transparency and opaque subject pixels.
- Current selection: 36 unique items, 29 owner-approved new pictures, one revised passport awaiting review, and six reused pictures. Reused originals and approval evidence are hash-verified.
- Chromium decoded the complete gallery, exposed 30 prompts and 144 previews, verified the passport/umbrella replacements and saved a visually inspected contact sheet.
- Mobile WebKit emulation decoded all 36 selected pictures without horizontal overflow at 390px. Real-iPhone testing remains deferred to deployment as requested.

App runtime and audio are unchanged by this artwork preparation.
